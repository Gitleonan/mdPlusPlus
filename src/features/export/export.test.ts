import { describe, it, expect, vi, beforeEach } from 'vitest';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile, getAppDataDir } from '../../ipc/files';
import { openFileWithSystem } from '../../ipc/opener';
import { buildStandaloneHtml, exportDocument } from './export';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
}));

vi.mock('../../ipc/files', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  getAppDataDir: vi.fn().mockResolvedValue('/app/data'),
}));

vi.mock('../../ipc/opener', () => ({
  openFileWithSystem: vi.fn().mockResolvedValue(undefined),
}));

describe('export', () => {
  const saveMock = vi.mocked(save);
  const writeFileMock = vi.mocked(writeFile);
  const openFileMock = vi.mocked(openFileWithSystem);
  const getAppDataDirMock = vi.mocked(getAppDataDir);

  beforeEach(() => {
    saveMock.mockReset();
    writeFileMock.mockClear();
    openFileMock.mockClear();
    getAppDataDirMock.mockClear();
    saveMock.mockResolvedValue('C:\\out\\doc.html');
    getAppDataDirMock.mockResolvedValue('/app/data');
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

  it('exports pdf by saving html to app data dir and opening in browser', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<h1>你好</h1><p>Hi</p>';

    await exportDocument({
      element: root,
      source: '# 你好',
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
