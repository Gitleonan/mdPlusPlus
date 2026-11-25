import { describe, it, expect, vi, beforeEach } from 'vitest';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile, getAppDataDir, readImagesAsDataUrls } from '../../ipc/files';
import { openFileWithSystem } from '../../ipc/opener';
import {
  buildStandaloneHtml,
  exportDocument,
  inlineKatexFontFaces,
} from './export';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
}));

vi.mock('../../ipc/files', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  getAppDataDir: vi.fn().mockResolvedValue('/app/data'),
  readImagesAsDataUrls: vi.fn().mockResolvedValue(new Map()),
  IMAGE_PLACEHOLDER: 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%E5%9B%BE%E7%89%87%E6%9C%AA%E6%89%BE%E5%88%B0%3C%2Fsvg%3E',
}));

vi.mock('../../ipc/opener', () => ({
  openFileWithSystem: vi.fn().mockResolvedValue(undefined),
}));

// Vitest 的 CSS 管线会让 `?raw` 读到空字符串；用一份最小的 KaTeX 字体规则
// 驱动集成路径，真实字体是否被内联由构建产物检查兜底。
vi.mock('katex/dist/katex.min.css?raw', () => ({
  default: '@font-face{font-family:KaTeX_Main;src:url(fonts/KaTeX_Main-Regular.woff2) format("woff2"),url(fonts/KaTeX_Main-Regular.woff) format("woff")}',
}));

describe('export', () => {
  const saveMock = vi.mocked(save);
  const writeFileMock = vi.mocked(writeFile);
  const openFileMock = vi.mocked(openFileWithSystem);
  const getAppDataDirMock = vi.mocked(getAppDataDir);
  const readImagesMock = vi.mocked(readImagesAsDataUrls);

  beforeEach(() => {
    saveMock.mockReset();
    writeFileMock.mockClear();
    openFileMock.mockClear();
    getAppDataDirMock.mockClear();
    readImagesMock.mockReset();
    readImagesMock.mockResolvedValue(new Map());
    saveMock.mockResolvedValue('C:\\out\\doc.html');
    getAppDataDirMock.mockResolvedValue('/app/data');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));
    document.body.innerHTML = '';
  });

  it('builds standalone html wrapping content with inline styles', () => {
    const html = buildStandaloneHtml('<h1>Hi</h1>', 'body { color: red; }', 'light');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('data-theme="light"');
    expect(html).toContain('<h1>Hi</h1>');
    expect(html).toContain('body { color: red; }');
  });

  it('supports dark theme', () => {
    const html = buildStandaloneHtml('<p>test</p>', '', 'dark');
    expect(html).toContain('data-theme="dark"');
  });

  it('standalone html has no external font or stylesheet requests', () => {
    const html = buildStandaloneHtml('', '', 'light');
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('cdn.jsdelivr.net');
    expect(html).not.toMatch(/url\(["']?fonts\//);
  });

  it('inlines woff2 fonts and drops fallback woff/ttf references', async () => {
    const css = [
      '@font-face{font-family:One;src:url(fonts/One-Regular.woff2) format("woff2"),',
      'url(fonts/One-Regular.woff) format("woff"),url(fonts/One-Regular.ttf) format("truetype")}',
      '.katex{font-family:One}',
    ].join('');
    const loadFont = vi.fn().mockResolvedValue('data:font/woff2;base64,AAAA');

    const result = await inlineKatexFontFaces(css, loadFont);

    expect(loadFont).toHaveBeenCalledWith('One-Regular.woff2');
    expect(result).toContain('src:url("data:font/woff2;base64,AAAA") format("woff2")');
    expect(result).not.toContain('.woff)');
    expect(result).not.toContain('.ttf)');
    expect(result).not.toContain('url(fonts/');
    expect(result).toContain('.katex{font-family:One}');
  });

  it('deduplicates font reads when several font-faces share one file', async () => {
    const css = [
      '@font-face{font-family:Main;font-weight:400;src:url(fonts/Main.woff2) format("woff2")}',
      '@font-face{font-family:Main;font-weight:700;src:url(fonts/Main.woff2) format("woff2")}',
    ].join('');
    const loadFont = vi.fn().mockResolvedValue('data:font/woff2;base64,BBBB');

    const result = await inlineKatexFontFaces(css, loadFont);

    expect(loadFont).toHaveBeenCalledTimes(1);
    expect(result.match(/data:font\/woff2;base64,BBBB/g)).toHaveLength(2);
  });

  it('keeps other style rules when one font cannot be read', async () => {
    const css = [
      '@font-face{font-family:Missing;src:url(fonts/Missing.woff2) format("woff2")}',
      '@font-face{font-family:Ready;src:url(fonts/Ready.woff2) format("woff2")}',
      '.katex{color:red}',
    ].join('');
    const loadFont = vi.fn(async (fileName: string) => {
      if (fileName === 'Missing.woff2') throw new Error('network down');
      return 'data:font/woff2;base64,CCCC';
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await inlineKatexFontFaces(css, loadFont);

    expect(result).not.toContain('Missing');
    expect(result).toContain('data:font/woff2;base64,CCCC');
    expect(result).toContain('.katex{color:red}');
    errorSpy.mockRestore();
  });

  it('exports pdf by saving html to app data dir and opening in browser', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<h1>你好</h1><p>Hi</p>';

    await exportDocument({
      element: root,
      source: '# 你好',
      filePath: 'C:\\docs\\note.md',
      fileName: 'note.md',
      theme: 'light',
      format: 'pdf',
    });

    // PDF export does NOT show a save dialog — writes to temp dir instead
    expect(saveMock).not.toHaveBeenCalled();

    // Should write standalone HTML (with print CSS + auto-print script)
    expect(writeFileMock).toHaveBeenCalledWith(
      '/app/data/note.html',
      expect.stringContaining('<!DOCTYPE html>'),
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      '/app/data/note.html',
      expect.not.stringContaining('url(fonts/'),
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      '/app/data/note.html',
      expect.stringContaining('window.print()'),
    );

    // Should open the temp HTML in the default browser (via system cmd, not opener plugin)
    expect(openFileMock).toHaveBeenCalledWith('/app/data/note.html');
  });

  it('exports markdown as a new md file', async () => {
    saveMock.mockResolvedValue('C:\\out\\copy.md');
    const root = document.createElement('div');

    await exportDocument({
      element: root,
      source: '# Title',
      filePath: 'C:\\docs\\note.md',
      fileName: 'note.md',
      theme: 'light',
      format: 'markdown',
    });

    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'note.md',
    }));
    expect(writeFileMock).toHaveBeenCalledWith('C:\\out\\copy.md', '# Title');
  });

  it('exports html files', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<h1>Title</h1>';

    saveMock.mockResolvedValueOnce('C:\\out\\note.html');
    await exportDocument({
      element: root,
      source: '# Title',
      filePath: 'C:\\docs\\note.md',
      fileName: 'note.md',
      theme: 'light',
      format: 'html',
    });
    expect(writeFileMock).toHaveBeenLastCalledWith('C:\\out\\note.html', expect.stringContaining('<h1>Title</h1>'));
    expect(writeFileMock).toHaveBeenLastCalledWith('C:\\out\\note.html', expect.stringContaining('.code-block-wrapper'));
    expect(writeFileMock).toHaveBeenLastCalledWith('C:\\out\\note.html', expect.stringContaining('.github-alert'));

    const html = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1][1];
    expect(html).toContain('data:font/woff2;base64,');
    expect(html).not.toContain('url(fonts/');
    expect(html).not.toContain('cdn.jsdelivr.net');
    expect(html).not.toContain('fonts.googleapis.com');
  });

  it('inlines local images and strips the source hint from exported HTML', async () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<p><img src="http://mdpp-img.localhost/C%3A/docs/pic.png" data-image-src="pic.png" alt="local"></p>',
      '<p><img src="https://example.com/remote.png" alt="remote"></p>',
    ].join('');
    readImagesMock.mockResolvedValue(new Map([['pic.png', 'data:image/png;base64,AAAA']]));

    await exportDocument({
      element: root,
      source: '',
      filePath: 'C:\\docs\\note.md',
      fileName: 'note.md',
      theme: 'light',
      format: 'html',
    });

    expect(readImagesMock).toHaveBeenCalledWith('C:\\docs\\note.md', ['pic.png']);
    const html = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1][1];
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).not.toContain('data-image-src');
    expect(html).not.toContain('mdpp-img');
    expect(html).toContain('src="https://example.com/remote.png"');
  });

  it('keeps uppercase HTTPS image URLs instead of treating them as local files', async () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<p><img src="HTTPS://example.com/remote.png" alt="remote"></p>',
      '<p><img src="pic.png" alt="local"></p>',
    ].join('');
    readImagesMock.mockResolvedValue(new Map([['pic.png', 'data:image/png;base64,AAAA']]));

    await exportDocument({
      element: root,
      source: '',
      filePath: 'C:\\docs\\note.md',
      fileName: 'note.md',
      theme: 'light',
      format: 'html',
    });

    expect(readImagesMock).toHaveBeenCalledWith('C:\\docs\\note.md', ['pic.png']);
    const html = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1][1];
    expect(html).toContain('src="HTTPS://example.com/remote.png"');
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });

  it('still exports local source images before async image resolution finishes', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><img src="assets/pic.png" alt="local"></p>';
    readImagesMock.mockResolvedValue(new Map([['assets/pic.png', 'data:image/png;base64,BBBB']]));

    await exportDocument({
      element: root,
      source: '',
      filePath: 'C:\\docs\\note.md',
      fileName: 'note.md',
      theme: 'light',
      format: 'html',
    });

    expect(readImagesMock).toHaveBeenCalledWith('C:\\docs\\note.md', ['assets/pic.png']);
    expect(writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1][1]).toContain(
      'src="data:image/png;base64,BBBB"',
    );
  });

  it('keeps exporting when image inlining fails', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><img src="pic.png" data-image-src="pic.png"></p>';
    readImagesMock.mockRejectedValue(new Error('ipc unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(exportDocument({
      element: root,
      source: '',
      filePath: 'C:\\docs\\note.md',
      fileName: 'note.md',
      theme: 'light',
      format: 'html',
    })).resolves.toBe('C:\\out\\doc.html');

    expect(writeFileMock).toHaveBeenCalledWith(
      'C:\\out\\doc.html',
      expect.stringContaining('src="data:image/svg+xml;charset=utf-8,'),
    );
    const html = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1][1];
    expect(html).not.toContain('src="pic.png"');
    expect(html).not.toContain('mdpp-img');
    expect(html).not.toContain('data-image-src');
    errorSpy.mockRestore();
  });

  it('replaces a missing local image with the embedded placeholder', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><img src="http://mdpp-img.localhost/C%3A/docs/missing.png" data-image-src="missing.png"></p>';
    readImagesMock.mockResolvedValue(new Map());

    await exportDocument({
      element: root,
      source: '',
      filePath: 'C:\\docs\\note.md',
      fileName: 'note.md',
      theme: 'light',
      format: 'html',
    });

    const html = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1][1];
    expect(html).toContain('src="data:image/svg+xml;charset=utf-8,');
    expect(html).not.toContain('mdpp-img');
    expect(html).not.toContain('data-image-src');
  });

  it('does not read images when the save dialog is cancelled', async () => {
    saveMock.mockResolvedValue(null);
    const root = document.createElement('div');
    root.innerHTML = '<p><img src="pic.png" data-image-src="pic.png"></p>';

    await exportDocument({
      element: root,
      source: '',
      filePath: 'C:\\docs\\note.md',
      fileName: 'note.md',
      theme: 'light',
      format: 'html',
    });

    expect(readImagesMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});
