import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useTabsStore } from './tabsStore';
import { useEphemeralStore } from './ephemeralStore';
import { useEditStore } from './editStore';
import { resetDiscardConfirmForTests, useDiscardConfirmStore } from './discardConfirmStore';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue('# Hello'),
}));

describe('tabsStore', () => {
  const invokeMock = vi.mocked(invoke);

  beforeEach(() => {
    resetDiscardConfirmForTests();
    useTabsStore.setState({ tabs: [], activeTabId: null });
    useEphemeralStore.setState({ enabled: false });
    useEditStore.setState({ isEditing: false, isDirty: false, lastSaveAt: 0 });
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
    await useTabsStore.getState().closeTab(id);
    expect(useTabsStore.getState().tabs).toHaveLength(0);
    expect(useTabsStore.getState().activeTabId).toBeNull();
  });

  it('closes tabs to the left and keeps the selected tab active when needed', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    await useTabsStore.getState().openTab('C:/b.md');
    await useTabsStore.getState().openTab('C:/c.md');
    const middleId = useTabsStore.getState().tabs[1].id;

    await useTabsStore.getState().closeTabsToLeft(middleId);

    const s = useTabsStore.getState();
    expect(s.tabs.map((t) => t.fileName)).toEqual(['b.md', 'c.md']);
    expect(s.activeTabId).toBe(s.tabs[1].id);
  });

  it('closes tabs to the right and activates the clicked tab if active was removed', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    await useTabsStore.getState().openTab('C:/b.md');
    await useTabsStore.getState().openTab('C:/c.md');
    const firstId = useTabsStore.getState().tabs[0].id;

    await useTabsStore.getState().closeTabsToRight(firstId);

    const s = useTabsStore.getState();
    expect(s.tabs.map((t) => t.fileName)).toEqual(['a.md']);
    expect(s.activeTabId).toBe(firstId);
  });

  it('closes other tabs', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    await useTabsStore.getState().openTab('C:/b.md');
    await useTabsStore.getState().openTab('C:/c.md');
    const middleId = useTabsStore.getState().tabs[1].id;
    useTabsStore.getState().setScrollTop(middleId, 240);
    useTabsStore.getState().setScrollTop(useTabsStore.getState().tabs[0].id, 80);

    await useTabsStore.getState().closeOtherTabs(middleId);

    const s = useTabsStore.getState();
    expect(s.tabs.map((t) => t.fileName)).toEqual(['b.md']);
    expect(s.activeTabId).toBe(middleId);
    expect(s.getScrollTop(middleId)).toBe(240);
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
    await useTabsStore.getState().setActive(id);
    expect(useTabsStore.getState().activeTabId).toBe(id);
  });

  it('persists open tabs and active file path for a webview refresh', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    await useTabsStore.getState().openTab('C:/b.md');
    const firstId = useTabsStore.getState().tabs[0].id;

    await useTabsStore.getState().setActive(firstId);

    expect(JSON.parse(localStorage.getItem('mdpp.openTabs.v1') || '{}')).toEqual({
      paths: ['C:\\a.md', 'C:\\b.md'],
      activePath: 'C:\\a.md',
    });
  });

  it('无痕模式下 openTab 不落盘会话', async () => {
    useEphemeralStore.getState().toggle();
    await useTabsStore.getState().openTab('C:/a.md');
    await useTabsStore.getState().setActive(useTabsStore.getState().tabs[0].id);
    expect(localStorage.getItem('mdpp.openTabs.v1')).toBeNull();
  });

  it('无痕模式下启动恢复被跳过并清掉旧会话', async () => {
    localStorage.setItem(
      'mdpp.openTabs.v1',
      JSON.stringify({ paths: ['C:\\old.md'], activePath: 'C:\\old.md' }),
    );
    useEphemeralStore.getState().toggle();
    await useTabsStore.getState().restoreSession();
    expect(useTabsStore.getState().tabs).toHaveLength(0);
    expect(localStorage.getItem('mdpp.openTabs.v1')).toBeNull();
  });

  it('closeAllTabs 清空全部标签', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    await useTabsStore.getState().openTab('C:/b.md');
    await useTabsStore.getState().closeAllTabs();
    const s = useTabsStore.getState();
    expect(s.tabs).toHaveLength(0);
    expect(s.activeTabId).toBeNull();
  });

  it('编辑模式下关闭脏 tab 需确认,取消则不关闭', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    const id = useTabsStore.getState().tabs[0].id;
    useEditStore.setState({ isEditing: true, isDirty: true });
    const close = useTabsStore.getState().closeTab(id);
    expect(useDiscardConfirmStore.getState().request?.message).toContain('a.md');
    useDiscardConfirmStore.getState().resolve(false);
    await close;
    expect(useTabsStore.getState().tabs).toHaveLength(1);

    const closeConfirmed = useTabsStore.getState().closeTab(id);
    useDiscardConfirmStore.getState().resolve(true);
    await closeConfirmed;
    expect(useTabsStore.getState().tabs).toHaveLength(0);
  });

  it('批量关闭时不会因前面有非脏 tab 而跳过当前脏 tab 的确认', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    await useTabsStore.getState().openTab('C:/b.md');
    await useTabsStore.getState().openTab('C:/c.md');
    const [first, second, third] = useTabsStore.getState().tabs;
    await useTabsStore.getState().setActive(third.id);
    useEditStore.setState({ isEditing: true, isDirty: true });

    // a、b 非脏，c 是当前脏 tab：some() 会在 a 处短路并误关 c。
    const closeOthers = useTabsStore.getState().closeOtherTabs(second.id);
    expect(useDiscardConfirmStore.getState().request).not.toBeNull();
    useDiscardConfirmStore.getState().resolve(false);
    await closeOthers;
    expect(useTabsStore.getState().tabs).toHaveLength(3);
    expect(useTabsStore.getState().activeTabId).toBe(third.id);

    const closeAll = useTabsStore.getState().closeAllTabs();
    expect(useDiscardConfirmStore.getState().request).not.toBeNull();
    useDiscardConfirmStore.getState().resolve(true);
    await closeAll;
    expect(useTabsStore.getState().tabs).toHaveLength(0);
    expect(first.id).not.toBe(third.id);
  });

  it('非编辑模式关 tab 不弹确认', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    const id = useTabsStore.getState().tabs[0].id;
    await useTabsStore.getState().closeTab(id);
    expect(useDiscardConfirmStore.getState().request).toBeNull();
    expect(useTabsStore.getState().tabs).toHaveLength(0);
  });

  it('编辑模式下切换脏 tab 需确认,取消则保持原编辑目标', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    await useTabsStore.getState().openTab('C:/b.md');
    const [first, second] = useTabsStore.getState().tabs;
    await useTabsStore.getState().setActive(first.id);
    useEditStore.setState({ isEditing: true, isDirty: true });

    const switchTab = useTabsStore.getState().setActive(second.id);
    expect(useDiscardConfirmStore.getState().request?.message).toContain('切换');
    useDiscardConfirmStore.getState().resolve(false);
    await switchTab;
    expect(useTabsStore.getState().activeTabId).toBe(first.id);
    expect(useEditStore.getState().isDirty).toBe(true);

    const switchConfirmed = useTabsStore.getState().setActive(second.id);
    useDiscardConfirmStore.getState().resolve(true);
    await switchConfirmed;
    expect(useTabsStore.getState().activeTabId).toBe(second.id);
  });

  it('编辑模式下打开新文件需确认,取消则不创建占位 tab', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    const first = useTabsStore.getState().tabs[0];
    useEditStore.setState({ isEditing: true, isDirty: true });

    const openSecond = useTabsStore.getState().openTab('C:/b.md');
    expect(useDiscardConfirmStore.getState().request).not.toBeNull();
    useDiscardConfirmStore.getState().resolve(false);
    await openSecond;
    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(useTabsStore.getState().activeTabId).toBe(first.id);

    const openConfirmed = useTabsStore.getState().openTab('C:/b.md');
    useDiscardConfirmStore.getState().resolve(true);
    await openConfirmed;
    expect(useTabsStore.getState().tabs).toHaveLength(2);
  });

  it('点击当前标签不触发未保存确认', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    const id = useTabsStore.getState().tabs[0].id;
    useEditStore.setState({ isEditing: true, isDirty: true });

    await useTabsStore.getState().setActive(id);
    expect(useTabsStore.getState().activeTabId).toBe(id);
    expect(useDiscardConfirmStore.getState().request).toBeNull();
  });

  it('editStore.toggleEditing 脏状态下需确认,取消则停留编辑', async () => {
    useEditStore.setState({ isEditing: true, isDirty: true });
    const exitEdit = useEditStore.getState().toggleEditing();
    expect(useDiscardConfirmStore.getState().request).not.toBeNull();
    useDiscardConfirmStore.getState().resolve(false);
    await exitEdit;
    expect(useEditStore.getState().isEditing).toBe(true);

    const exitConfirmed = useEditStore.getState().toggleEditing();
    useDiscardConfirmStore.getState().resolve(true);
    await exitConfirmed;
    expect(useEditStore.getState().isEditing).toBe(false);
    expect(useEditStore.getState().isDirty).toBe(false);
  });

  it('sets scroll position', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    const id = useTabsStore.getState().tabs[0].id;
    const tabBefore = useTabsStore.getState().tabs[0];
    useTabsStore.getState().setScrollTop(id, 150);
    expect(useTabsStore.getState().getScrollTop(id)).toBe(150);
    expect(useTabsStore.getState().tabs[0]).toBe(tabBefore);
  });

  it('updates source', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    const id = useTabsStore.getState().tabs[0].id;
    useTabsStore.getState().updateSource(id, '# New', {
      html: '<h1>New</h1>',
      toc: [],
    });
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
    expect(useTabsStore.getState().getScrollTop(id)).toBe(150);
    expect(tab.source).toBe('# Reloaded');
    expect(tab.html).toContain('Reloaded');
  });

  it('reload failure keeps existing content instead of replacing it with an error page', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    const id = useTabsStore.getState().tabs[0].id;
    invokeMock.mockRejectedValue(new Error('permission denied'));

    await useTabsStore.getState().reloadTab(id);

    const tab = useTabsStore.getState().tabs[0];
    expect(tab.source).toBe('# Hello');
    expect(tab.html).toContain('Hello');
    expect(tab.html).not.toContain('打开文件失败');
    expect(tab.isLoading).toBe(false);
  });

  it('records a load error and blocks editing so an empty buffer cannot overwrite the file', async () => {
    invokeMock.mockRejectedValue(new Error('permission denied'));

    await useTabsStore.getState().openTab('C:/locked.md');

    const tab = useTabsStore.getState().tabs[0];
    expect(tab.loadError).toContain('permission denied');
    await useEditStore.getState().toggleEditing();
    expect(useEditStore.getState().isEditing).toBe(false);
  });

  it('编辑模式下刷新脏 tab 需确认,取消则保留草稿', async () => {
    await useTabsStore.getState().openTab('C:/a.md');
    const id = useTabsStore.getState().tabs[0].id;
    useEditStore.setState({ isEditing: true, isDirty: true });
    invokeMock.mockResolvedValue('# From disk');

    const reload = useTabsStore.getState().reloadTab(id);
    expect(useDiscardConfirmStore.getState().request?.message).toContain('刷新');
    useDiscardConfirmStore.getState().resolve(false);
    await reload;

    expect(useTabsStore.getState().tabs[0].source).toBe('# Hello');
    expect(useEditStore.getState().isDirty).toBe(true);
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
    expect(s.tabs.map((t) => t.fileName)).toEqual(['a.md', 'b.md', 'new.md']);
    expect(s.tabs.filter((t) => t.fileName === 'new.md')).toHaveLength(1);
    expect(s.tabs.find((t) => t.id === s.activeTabId)?.filePath).toBe('C:\\new.md');
  });

  it('restoreSession still loads a restored tab when the user switches to it mid-restore', async () => {
    localStorage.setItem(
      'mdpp.openTabs.v1',
      JSON.stringify({ paths: ['C:/a.md', 'C:/b.md'], activePath: 'C:/b.md' }),
    );
    invokeMock.mockResolvedValue('# Hello');

    const restore = useTabsStore.getState().restoreSession();
    // restoreSession 首次让出事件循环后，用户点回旧会话里的 b.md
    const restoredActive = useTabsStore.getState().activeTabId!;
    await useTabsStore.getState().setActive(restoredActive);
    await restore;

    await vi.waitFor(() => {
      const s = useTabsStore.getState();
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      expect(tab?.filePath).toBe('C:\\b.md');
      expect(tab?.html).toContain('Hello');
      expect(tab?.isLazy).toBe(false);
    });
  });

  it('restoreSession reads only the active tab immediately', async () => {
    localStorage.setItem(
      'mdpp.openTabs.v1',
      JSON.stringify({ paths: ['C:/a.md', 'C:/b.md'], activePath: 'C:/b.md' }),
    );
    const readPaths: string[] = [];
    invokeMock.mockImplementation(async (command, args) => {
      if (command === 'read_text_file') {
        readPaths.push((args as { path: string }).path);
        return '# Hello';
      }
      return undefined;
    });

    await useTabsStore.getState().restoreSession();

    expect(readPaths).toEqual(['C:\\b.md']);
    expect(useTabsStore.getState().tabs.find((t) => t.fileName === 'a.md')?.isLazy).toBe(true);
  });

  it('escapes file read errors before inserting them into preview html', async () => {
    invokeMock.mockRejectedValue(new Error('<img src=x onerror="alert(1)">'));

    await useTabsStore.getState().openTab('C:/evil.md');

    const tab = useTabsStore.getState().tabs[0];
    expect(tab.html).toContain('&lt;img');
    expect(tab.html).not.toContain('<img');
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
    const lazyTab = s.tabs.find((t) => t.fileName === 'a.md');
    expect(lazyTab?.isLazy).toBe(true);
    expect(lazyTab?.html).toBe('');
    expect(s.tabs.find((t) => t.id === s.activeTabId)?.filePath).toBe('C:\\b.md');

    await useTabsStore.getState().setActive(lazyTab!.id);
    await vi.waitFor(() => {
      const errorTab = useTabsStore.getState().tabs.find((t) => t.fileName === 'a.md');
      expect(errorTab?.html).toContain('打开文件失败');
    });
  });

  it('restoreSession falls back to the last tab when the saved active path is gone', async () => {
    localStorage.setItem(
      'mdpp.openTabs.v1',
      JSON.stringify({ paths: ['C:/a.md', 'C:/b.md'], activePath: 'C:/deleted.md' }),
    );

    await useTabsStore.getState().restoreSession();

    const s = useTabsStore.getState();
    expect(s.tabs.map((t) => t.fileName)).toEqual(['a.md', 'b.md']);
    // 不能让 activeTabId 停在 null——那会在有 tab 的情况下显示欢迎页
    expect(s.tabs.find((t) => t.id === s.activeTabId)?.filePath).toBe('C:\\b.md');
  });

  it('restoreSession keeps the last tab active when the session has no active path', async () => {
    localStorage.setItem(
      'mdpp.openTabs.v1',
      JSON.stringify({ paths: ['C:/a.md', 'C:/b.md'], activePath: null }),
    );

    await useTabsStore.getState().restoreSession();

    const s = useTabsStore.getState();
    expect(s.tabs.find((t) => t.id === s.activeTabId)?.filePath).toBe('C:\\b.md');
  });
});
