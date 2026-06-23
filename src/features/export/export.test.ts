import { describe, it, expect, vi, beforeEach } from 'vitest';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '../../ipc/files';
import { buildStandaloneHtml, exportDocument } from './export';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
}));

vi.mock('../../ipc/files', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe('export', () => {
  const saveMock = vi.mocked(save);
  const writeFileMock = vi.mocked(writeFile);

  beforeEach(() => {
    saveMock.mockReset();
    writeFileMock.mockClear();
    saveMock.mockResolvedValue('C:\\out\\doc.html');
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

  it('includes katex CSS link', () => {
    const html = buildStandaloneHtml('', '', 'light');
    expect(html).toContain('katex');
  });

  it('exports pdf via main window.print + overlay, not via saveDialog or rust', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<h1>你好</h1><p>Hi</p>';

    // jsdom 没实现 print，给 window.print 打桩
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    await exportDocument({
      element: root,
      source: '# 你好',
      fileName: 'note.md',
      theme: 'light',
      format: 'pdf',
    });

    expect(saveMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(printSpy).toHaveBeenCalledTimes(1);

    // 验证 overlay 被注入后又清理了
    expect(document.querySelector('.print-overlay')).toBeNull();
    expect(document.getElementById('print-overlay-style')).toBeNull();

    printSpy.mockRestore();
  });

  it('exports markdown as a new md file', async () => {
    saveMock.mockResolvedValue('C:\\out\\copy.md');
    const root = document.createElement('div');

    await exportDocument({
      element: root,
      source: '# Title',
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
      fileName: 'note.md',
      theme: 'light',
      format: 'html',
    });
    expect(writeFileMock).toHaveBeenLastCalledWith('C:\\out\\note.html', expect.stringContaining('<h1>Title</h1>'));
    expect(writeFileMock).toHaveBeenLastCalledWith('C:\\out\\note.html', expect.stringContaining('.code-block-wrapper'));
    expect(writeFileMock).toHaveBeenLastCalledWith('C:\\out\\note.html', expect.stringContaining('.github-alert'));
  });
});
