import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listen } from '@tauri-apps/api/event';
import { useTabsStore } from '../../stores/tabsStore';
import { useEditStore } from '../../stores/editStore';
import { useRevisionStore } from '../../stores/revisionStore';
import { readFile } from '../../ipc/files';
import { useFileWatcher } from './useFileWatcher';
import { useToastStore } from '../../stores/toastStore';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('../../ipc/files', () => ({
  readFile: vi.fn(),
  watchFiles: vi.fn().mockResolvedValue(undefined),
}));

describe('useFileWatcher', () => {
  beforeEach(() => {
    vi.mocked(listen).mockReset();
    vi.mocked(readFile).mockReset();
    useToastStore.setState({ toasts: [] });
    useEditStore.setState({ isEditing: false, isDirty: false, lastSaveAt: 0 });
    useRevisionStore.setState({
      isRevisionMode: false,
      revisions: [],
      currentRevisionId: null,
      currentSegmentIndex: 0,
      snapshotSource: '',
    });
    useTabsStore.setState({
      activeTabId: 'tab-1',
      tabs: [{
        id: 'tab-1',
        filePath: 'C:\\Docs\\Note.md',
        fileName: 'Note.md',
        source: '# Old',
        html: '<h1>Old</h1>',
        highlightComplete: true,
        toc: [],
        tocExpanded: {},
        isLoading: false,
      }],
    });
  });

  it('refreshes a tab when Windows delivers the same path with different case and slashes', async () => {
    let handler: ((event: { payload: string[] }) => Promise<void>) | null = null;
    vi.mocked(listen).mockImplementation((async (_name: string, cb: typeof handler) => {
      handler = cb;
      return () => {};
    }) as typeof listen);
    vi.mocked(readFile).mockResolvedValue('# New');

    renderHook(() => useFileWatcher());
    await handler!({ payload: ['c:/docs/note.MD'] });

    expect(useTabsStore.getState().tabs[0].source).toBe('# New');
    expect(useTabsStore.getState().tabs[0].html).toContain('New');
  });

  it('keeps a dirty edit when the same file changes on disk', async () => {
    let handler: ((event: { payload: string[] }) => Promise<void>) | null = null;
    vi.mocked(listen).mockImplementation((async (_name: string, cb: typeof handler) => {
      handler = cb;
      return () => {};
    }) as typeof listen);
    vi.mocked(readFile).mockResolvedValue('# External change');
    useEditStore.setState({ isEditing: true, isDirty: true });

    renderHook(() => useFileWatcher());
    await handler!({ payload: ['C:\\Docs\\Note.md'] });

    expect(readFile).not.toHaveBeenCalled();
    expect(useTabsStore.getState().tabs[0].source).toBe('# Old');
    expect(useToastStore.getState().toasts[0].message).toContain('草稿已保留');
  });
});
