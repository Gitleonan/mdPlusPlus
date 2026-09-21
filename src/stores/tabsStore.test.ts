import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useTabsStore } from './tabsStore';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue('# Hello'),
}));

describe('tabsStore', () => {
  const invokeMock = vi.mocked(invoke);

  beforeEach(() => {
    useTabsStore.setState({ tabs: [], activeTabId: null });
    localStorage.clear();
    invokeMock.mockResolvedValue('# Hello');
  });

  it('opens a new tab', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    const s = useTabsStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].fileName).toBe('a.md');
    expect(s.tabs[0].filePath).toBe('C:\\a.md');
    expect(s.activeTabId).toBe(s.tabs[0].id);
  });

  it('deduplicates same path', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    await useTabsStore.getState().openTab('C:/a.md');
    expect(useTabsStore.getState().tabs).toHaveLength(1);
  });

  it('deduplicates paths that differ only by case or slash style on Windows', async () => {
    await useTabsStore.getState().openTab('C:\\Foo\\readme.md');
    await useTabsStore.getState().openTab('c:/foo/README.MD');
    await useTabsStore.getState().openTab('C:\\\\Foo\\\\readme.md');
    expect(useTabsStore.getState().tabs).toHaveLength(1);
  });

  it('closes a tab and clears active if last', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    const id = useTabsStore.getState().tabs[0].id;
    useTabsStore.getState().closeTab(id);
    expect(useTabsStore.getState().tabs).toHaveLength(0);
    expect(useTabsStore.getState().activeTabId).toBeNull();
  });

  it('closes tabs to the left and keeps the selected tab active when needed', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    await useTabsStore.getState().openTab('C:/b.md');
    await useTabsStore.getState().openTab('C:/c.md');
    const middleId = useTabsStore.getState().tabs[1].id;

    useTabsStore.getState().closeTabsToLeft(middleId);

    const s = useTabsStore.getState();
    expect(s.tabs.map((t) => t.fileName)).toEqual(['b.md', 'c.md']);
    expect(s.activeTabId).toBe(s.tabs[1].id);
  });

  it('closes tabs to the right and activates the clicked tab if active was removed', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    await useTabsStore.getState().openTab('C:/b.md');
    await useTabsStore.getState().openTab('C:/c.md');
    const firstId = useTabsStore.getState().tabs[0].id;

    useTabsStore.getState().closeTabsToRight(firstId);

    const s = useTabsStore.getState();
    expect(s.tabs.map((t) => t.fileName)).toEqual(['a.md']);
    expect(s.activeTabId).toBe(firstId);
  });

  it('closes other tabs', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    await useTabsStore.getState().openTab('C:/b.md');
    await useTabsStore.getState().openTab('C:/c.md');
    const middleId = useTabsStore.getState().tabs[1].id;

    useTabsStore.getState().closeOtherTabs(middleId);

    const s = useTabsStore.getState();
    expect(s.tabs.map((t) => t.fileName)).toEqual(['b.md']);
    expect(s.activeTabId).toBe(middleId);
  });

  it('moves a tab before the drop target and persists the new order', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    await useTabsStore.getState().openTab('C:/b.md');
    await useTabsStore.getState().openTab('C:/c.md');
    const [a, , c] = useTabsStore.getState().tabs;

    useTabsStore.getState().moveTab(c.id, a.id);

    expect(useTabsStore.getState().tabs.map((t) => t.fileName)).toEqual(['c.md', 'a.md', 'b.md']);
    expect(JSON.parse(localStorage.getItem('mdpp.openTabs.v1') || '{}').paths).toEqual([
      'C:\\c.md',
      'C:\\a.md',
      'C:\\b.md',
    ]);
  });

  it('sets active tab', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    await useTabsStore.getState().openTab('C:/b.md');
    const id = useTabsStore.getState().tabs[0].id;
    useTabsStore.getState().setActive(id);
    expect(useTabsStore.getState().activeTabId).toBe(id);
  });

  it('persists open tabs and active file path for a webview refresh', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    await useTabsStore.getState().openTab('C:/b.md');
    const firstId = useTabsStore.getState().tabs[0].id;

    useTabsStore.getState().setActive(firstId);

    expect(JSON.parse(localStorage.getItem('mdpp.openTabs.v1') || '{}')).toEqual({
      paths: ['C:\\a.md', 'C:\\b.md'],
      activePath: 'C:\\a.md',
    });
  });

  it('sets scroll position', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    const id = useTabsStore.getState().tabs[0].id;
    useTabsStore.getState().setScrollTop(id, 150);
    expect(useTabsStore.getState().tabs[0].scrollTop).toBe(150);
  });

  it('updates source', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    const id = useTabsStore.getState().tabs[0].id;
    useTabsStore.getState().updateSource(id, '# New', '<h1>New</h1>', []);
    expect(useTabsStore.getState().tabs[0].source).toBe('# New');
    expect(useTabsStore.getState().tabs[0].html).toBe('<h1>New</h1>');
  });

  it('reloads a tab from disk without replacing its identity or scroll position', async () => {
    let reads = 0;
    invokeMock.mockImplementation(async (command) => {
      if (command === 'read_text_file') {
        reads += 1;
        return reads === 1 ? '# Hello' : '# Reloaded';
      }
      return undefined;
    });

    await useTabsStore.getState().openTab('C:/a.md');
    const id = useTabsStore.getState().tabs[0].id;
    useTabsStore.getState().setScrollTop(id, 150);

    await useTabsStore.getState().reloadTab(id);

    const tab = useTabsStore.getState().tabs[0];
    expect(tab.id).toBe(id);
    expect(tab.scrollTop).toBe(150);
    expect(tab.source).toBe('# Reloaded');
    expect(tab.html).toContain('Reloaded');
  });

  it('restores open tabs from the last session', async () => {
    localStorage.setItem(
      'mdpp.openTabs.v1',
      JSON.stringify({ paths: ['C:/a.md', 'C:/b.md'], activePath: 'C:/b.md' }),
    );

    await useTabsStore.getState().restoreSession();

    const s = useTabsStore.getState();
    expect(s.tabs.map((t) => t.filePath)).toEqual(['C:\\a.md', 'C:\\b.md']);
    expect(s.tabs.find((t) => t.id === s.activeTabId)?.filePath).toBe('C:\\b.md');
  });

  it('restoreSession yields focus to a file opened by the user during restore', async () => {
    localStorage.setItem(
      'mdpp.openTabs.v1',
      JSON.stringify({ paths: ['C:/a.md', 'C:/b.md'], activePath: 'C:/b.md' }),
    );
    // 第一次读取（恢复的第一个文件）拖慢，模拟恢复进行中收到二次启动转发
    let reads = 0;
    invokeMock.mockImplementation(async (command) => {
      if (command === 'read_text_file') {
        reads += 1;
        if (reads === 1) await new Promise((r) => setTimeout(r, 30));
        return '# Hello';
      }
      return undefined;
    });

    const restore = useTabsStore.getState().restoreSession();
    await new Promise((r) => setTimeout(r, 10));
    // 模拟单实例转发 / 双击打开新文件（用户主动打开）
    await useTabsStore.getState().openTab('C:/new.md');
    await restore;

    const s = useTabsStore.getState();
    expect(s.tabs.map((t) => t.fileName)).toEqual(['a.md', 'new.md', 'b.md']);
    expect(s.tabs.find((t) => t.id === s.activeTabId)?.filePath).toBe('C:\\new.md');
  });

  it('restoreSession does not steal focus for a missing file tab', async () => {
    localStorage.setItem(
      'mdpp.openTabs.v1',
      JSON.stringify({ paths: ['C:/a.md', 'C:/b.md'], activePath: 'C:/b.md' }),
    );
    invokeMock.mockImplementation(async (command, args) => {
      if (command === 'read_text_file') {
        const path = (args as { path?: string } | undefined)?.path ?? '';
        if (path.includes('a.md')) throw new Error('读取文件失败: 系统找不到指定的文件。 (os error 2)');
        return '# Hello';
      }
      return undefined;
    });

    await useTabsStore.getState().restoreSession();

    const s = useTabsStore.getState();
    const errorTab = s.tabs.find((t) => t.fileName === 'a.md');
    expect(errorTab?.html).toContain('打开文件失败');
    expect(s.tabs.find((t) => t.id === s.activeTabId)?.filePath).toBe('C:\\b.md');
  });
});
