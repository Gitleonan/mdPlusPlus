import { create } from 'zustand';
import type { Tab } from '../types';
import { renderMarkdownDocument } from '../features/markdown/render';
import { hasCodeBlocks, highlightCodeBlocksChunked } from '../features/markdown/highlight';
import { readFile, watchFiles } from '../ipc/files';
import { isMac } from '../utils/platform';
import { useEphemeralStore } from './ephemeralStore';
import { useEditStore } from './editStore';
import { useDiscardConfirmStore } from './discardConfirmStore';
import { useToastStore } from './toastStore';
import type { RenderedMarkdown } from '../features/markdown/render';

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
  /** activate=false 用于会话恢复等批量打开：插入 tab 但不抢走当前 active */
  openTab: (filePath: string, activate?: boolean) => Promise<void>;
  closeTab: (id: string) => Promise<void>;
  closeTabsToLeft: (id: string) => Promise<void>;
  closeTabsToRight: (id: string) => Promise<void>;
  closeOtherTabs: (id: string) => Promise<void>;
  closeAllTabs: () => Promise<void>;
  moveTab: (id: string, targetId: string) => void;
  setActive: (id: string) => Promise<void>;
  setScrollTop: (id: string, scrollTop: number) => void;
  getScrollTop: (id: string) => number;
  updateSource: (
    id: string,
    source: string,
    rendered: Pick<RenderedMarkdown, 'html' | 'toc'>,
  ) => void;
  reloadTab: (id: string, options?: { skipDiscardConfirm?: boolean }) => Promise<void>;
  /** 同步关闭标签（已由调用方完成未保存确认；窗口关闭流程使用） */
  closeTabNow: (id: string) => void;
  closeAllTabsNow: () => void;
  restoreSession: () => Promise<void>;
  /** 无视无痕守卫立即落盘当前 tab 集(退出无痕时的"所见即所留"基线) */
  syncSessionNow: () => void;
}

let seq = 0;
/** 每个标签最近一次后台高亮任务的版本，用来丢弃过期结果 */
const highlightVersions = new Map<string, number>();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
/** 滚动位置不属于文档内容，放独立 map 避免每次滚动都替换 tab 对象。 */
const scrollPositions = new Map<string, number>();
// 用户主动打开文件的计数：restoreSession 结束时用它判断恢复期间是否有
// 用户（或二次启动转发）打开过文件 —— 有则让位，不再把 active 抢回旧会话的 tab。
let userOpenCount = 0;
const SESSION_KEY = 'mdpp.openTabs.v1';

/**
 * 路径比较归一化：统一分隔符并转小写用于去重。
 * Windows: 反斜杠 + 大小写不敏感 → 统一为反斜杠小写
 * macOS:   正斜杠 + HFS/APFS 默认大小写不敏感 → 仅转小写
 * Linux:   正斜杠 + 大小写敏感 → 保留原样
 */
export function normalizePathKey(p: string): string {
  if (isMac()) {
    return p.toLowerCase();
  }
  return p.replace(/\//g, '\\').replace(/\\+/g, '\\').toLowerCase();
}

function isWindows(): boolean {
  return !isMac();
}

function saveSession(tabs: Tab[], activeTabId: string | null) {
  // 无痕会话：跳过写入，下次启动由 restoreSession 清掉旧会话
  if (useEphemeralStore.getState().enabled) return;
  try {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        paths: tabs.map((t) => t.filePath),
        activePath: activeTab?.filePath ?? null,
      }),
    );
  } catch {
    // localStorage may be unavailable in tests or restricted environments.
  }
}

function readSession(): { paths: string[]; activePath: string | null } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { paths?: unknown; activePath?: unknown };
    if (!Array.isArray(parsed.paths)) return null;
    return {
      paths: parsed.paths.filter((p): p is string => typeof p === 'string'),
      activePath: typeof parsed.activePath === 'string' ? parsed.activePath : null,
    };
  } catch {
    return null;
  }
}

type BuiltTab = Omit<Tab, 'id'>;

async function buildTab(filePath: string): Promise<BuiltTab> {
  console.log('[buildTab] reading file:', filePath);
  const source = await readFile(filePath);
  console.log('[buildTab] file read, length:', source.length);
  const { html, toc } = renderMarkdownDocument(source);
  console.log('[buildTab] markdown rendered, toc:', toc.length, 'items');
  const fileName = filePath.split(/[/\\]/).pop() || filePath;
  return {
    filePath,
    fileName,
    source,
    html,
    // 首屏不等待 Shiki；后台任务完成前可能有未着色代码块。
    highlightComplete: !hasCodeBlocks(html),
    toc,
    tocExpanded: {},
    isLoading: false,
  };
}

type TabsStoreSet = {
  (
    partial:
      | TabsState
      | Partial<TabsState>
      | ((state: TabsState) => TabsState | Partial<TabsState>),
  ): void;
};

/**
 * 首屏先展示普通代码块，随后在帧间逐步替换成 Shiki。
 * 高亮结果只回写同一份 HTML，不重跑 Markdown 或 TOC。
 */
export function scheduleHighlight(
  set: TabsStoreSet,
  id: string,
  html: string,
): void {
  if (!hasCodeBlocks(html)) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, highlightComplete: true } : t)),
    }));
    return;
  }
  const version = (highlightVersions.get(id) ?? 0) + 1;
  highlightVersions.set(id, version);
  const currentHtml = html;
  // 让调用方先完成首屏状态提交，再开始高亮。
  queueMicrotask(() => {
    void highlightCodeBlocksChunked(
      currentHtml,
      (highlighted) => {
        if (highlightVersions.get(id) !== version) return;
        set((s) => ({
          tabs: s.tabs.map((t) => (
            t.id === id && t.html === currentHtml
              ? { ...t, html: highlighted, highlightComplete: true }
              : t
          )),
        }));
      },
      () => highlightVersions.get(id) !== version,
    ).catch((err) => {
      console.error('[highlight] chunked highlight failed', err);
      if (highlightVersions.get(id) === version) {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, highlightComplete: true } : t)),
        }));
      }
    });
  });
}

/** 同步标签页路径到 Rust watcher，让外部编辑时能自动刷新 */
function syncWatcherFromTabs(tabs: Tab[]) {
  const paths = tabs.map((t) => t.filePath);
  watchFiles(paths).catch(() => {
    // 忽略：Tauri 命令可能还没注册（开发时前端先启动）
  });
}

function syncSessionAndWatcher(tabs: Tab[], activeTabId: string | null) {
  saveSession(tabs, activeTabId);
  syncWatcherFromTabs(tabs);
}

/**
 * 关闭可能丢弃未保存修改的 tab 前确认,防静默数据丢失。
 * 仅编辑模式下的 tab 才可能脏(编辑器是唯一改动入口),故对单个 tab 只在
 * 它是当前编辑目标时询问;所有 close* 变体统一经此守卫。
 */
async function confirmDiscardDirty(
  s: { tabs: Tab[]; activeTabId: string | null },
  id: string,
  action: '关闭' | '切换' | '刷新',
): Promise<boolean> {
  const editing = useEditStore.getState();
  if (!editing.isEditing || !editing.isDirty || s.activeTabId !== id) return true;
  const target = s.tabs.find((t) => t.id === id);
  return useDiscardConfirmStore.getState().ask(
    `放弃未保存的修改？`,
    `「${target?.fileName ?? '当前文档'}」有未保存的修改，${action}后将丢失。`,
    `放弃并${action}`,
  );
}

/**
 * 切换/打开文件会离开当前编辑标签。编辑器只在 active tab 上存在，
 * 若此时有未保存内容，必须先确认，不能交给 App 的 activeTab 副作用静默 reset。
 */
async function confirmLeaveActiveDirty(
  s: { tabs: Tab[]; activeTabId: string | null },
  nextTabId: string | null,
): Promise<boolean> {
  const editing = useEditStore.getState();
  if (!editing.isEditing || !editing.isDirty || s.activeTabId === nextTabId) return true;
  const target = s.tabs.find((t) => t.id === s.activeTabId);
  return useDiscardConfirmStore.getState().ask(
    '放弃未保存的修改？',
    `「${target?.fileName ?? '当前文档'}」有未保存的修改，切换后将丢失。`,
    '放弃并切换',
  );
}

/**
 * 批量关闭只可能有一个脏 tab——编辑器只存在于 active tab。
 * 一次检查目标集合是否包含它，避免逐个 await 造成多次弹窗或提前放行。
 */
function confirmClosingTabs(
  s: { tabs: Tab[]; activeTabId: string | null },
  targets: Tab[],
): Promise<boolean> {
  const editing = useEditStore.getState();
  if (!editing.isEditing || !editing.isDirty) return Promise.resolve(true);
  const active = targets.find((t) => t.id === s.activeTabId);
  if (!active) return Promise.resolve(true);
  return useDiscardConfirmStore.getState().ask(
    '放弃未保存的修改？',
    `「${active.fileName}」有未保存的修改，关闭后将丢失。`,
    '放弃并关闭',
  );
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  async openTab(filePath, activate = true) {
    console.log('[openTab] called with:', filePath);
    // Windows 路径归一化：统一使用反斜杠分隔符；macOS/Linux 保留正斜杠
    const normalized = isWindows() ? filePath.replace(/\//g, '\\') : filePath;
    const targetKey = normalizePathKey(filePath);
    const existing = get().tabs.find(
      (t) => normalizePathKey(t.filePath) === targetKey,
    );
    if (existing) {
      console.log('[openTab] file already open, switching to tab:', existing.id);
      if (activate) {
        userOpenCount++;
        await get().setActive(existing.id);
      }
      return;
    }
    // 新文件会接管 active tab；被取消时连占位 tab 都不创建，避免留下半开标签。
    if (activate && !await confirmLeaveActiveDirty(get(), null)) return;
    // 先插入一个 loading 占位 tab，让用户立刻看到反馈。
    // activate=false（会话恢复）时不改变 activeTabId，避免恢复旧 tab 时
    // 抢走用户刚通过双击/转发打开的文件的焦点。
    const placeholderId = `tab-${++seq}`;
    const fileName = normalized.split(/[/\\]/).pop() || normalized;
    const placeholder: Tab = {
      id: placeholderId,
      filePath: normalized,
      fileName,
      source: '',
      html: '',
      highlightComplete: true,
      toc: [],
      tocExpanded: {},
      isLoading: true,
    };
    if (activate) userOpenCount++;
    set((s) => {
      const tabs = [...s.tabs, placeholder];
      // 会话恢复不落盘 session，避免恢复过程中把上次会话的 activePath 覆盖掉；
      // 恢复完成后由 setActive 统一写入
      if (activate) syncSessionAndWatcher(tabs, placeholderId);
      else syncWatcherFromTabs(tabs);
      return { tabs, ...(activate ? { activeTabId: placeholderId } : {}) };
    });
    try {
      const tab = await buildTab(normalized);
      console.log('[openTab] tab built successfully:', placeholderId, tab.fileName);
      set((s) => {
        const tabs = s.tabs.map((t) => (t.id === placeholderId ? { ...tab, id: placeholderId, isLoading: false } : t));
        saveSession(tabs, activate ? placeholderId : s.activeTabId);
        return { tabs };
      });
      syncWatcherFromTabs(get().tabs);
      if (activate) scheduleHighlight(set, placeholderId, tab.html);
    } catch (err) {
      console.error('[openTab] buildTab failed:', err);
      // 构建失败时保留 tab 但显示错误信息，而不是直接删除（避免链接点击后闪关）
      const errorMsg = err instanceof Error ? err.message : String(err);
      set((s) => {
        const tabs = s.tabs.map((t) => (
          t.id === placeholderId
            ? {
                ...t,
                loadError: errorMsg,
                isLoading: false,
                highlightComplete: true,
                html: `<div class="mermaid-error" role="note">打开文件失败：${escapeHtml(errorMsg)}</div>`,
                source: '',
              }
            : t
        ));
        saveSession(tabs, s.activeTabId);
        return { tabs };
      });
      syncWatcherFromTabs(get().tabs);
    }
  },

  async closeTab(id) {
    // 所有 close* 变体统一先走应用内异步确认；WebView 原生 confirm 不可依赖。
    if (!await confirmDiscardDirty(get(), id, '关闭')) return;
    get().closeTabNow(id);
  },

  closeTabNow(id) {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      const tabs = s.tabs.filter((t) => t.id !== id);
      scrollPositions.delete(id);
      let activeTabId = s.activeTabId;
      if (activeTabId === id) {
        activeTabId = tabs[idx]?.id ?? tabs[idx - 1]?.id ?? null;
      }
      syncSessionAndWatcher(tabs, activeTabId);
      return { tabs, activeTabId };
    });
  },

  async closeTabsToLeft(id) {
    // 左侧可能包含脏 tab:任一将被丢弃的 tab 为脏时确认一次
    const s = get();
    const idx = s.tabs.findIndex((t) => t.id === id);
    if (idx <= 0) return;
    if (!await confirmClosingTabs(s, s.tabs.slice(0, idx))) return;
    set((st) => {
      const i = st.tabs.findIndex((t) => t.id === id);
      if (i <= 0) return st;
      const tabs = st.tabs.slice(i);
      const activeTabId = tabs.some((t) => t.id === st.activeTabId) ? st.activeTabId : id;
      syncSessionAndWatcher(tabs, activeTabId);
      st.tabs.slice(0, i).forEach((t) => scrollPositions.delete(t.id));
      return { tabs, activeTabId };
    });
  },

  async closeTabsToRight(id) {
    const s = get();
    const idx = s.tabs.findIndex((t) => t.id === id);
    if (idx < 0 || idx >= s.tabs.length - 1) return;
    if (!await confirmClosingTabs(s, s.tabs.slice(idx + 1))) return;
    set((st) => {
      const i = st.tabs.findIndex((t) => t.id === id);
      if (i < 0 || i >= st.tabs.length - 1) return st;
      const tabs = st.tabs.slice(0, i + 1);
      const activeTabId = tabs.some((t) => t.id === st.activeTabId) ? st.activeTabId : id;
      syncSessionAndWatcher(tabs, activeTabId);
      st.tabs.slice(i + 1).forEach((t) => scrollPositions.delete(t.id));
      return { tabs, activeTabId };
    });
  },

  async closeOtherTabs(id) {
    const s = get();
    if (!s.tabs.find((t) => t.id === id)) return;
    if (!await confirmClosingTabs(s, s.tabs.filter((t) => t.id !== id))) return;
    set((st) => {
      const tab = st.tabs.find((t) => t.id === id);
      if (!tab) return st;
      const tabs = [tab];
      syncSessionAndWatcher(tabs, id);
      // 保留当前 tab 的滚动记忆；只丢弃被关闭的其它 tab。
      st.tabs.forEach((t) => {
        if (t.id !== id) scrollPositions.delete(t.id);
      });
      return { tabs, activeTabId: id };
    });
  },

  syncSessionNow() {
    const s = get();
    try {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          paths: s.tabs.map((t) => t.filePath),
          activePath: s.tabs.find((t) => t.id === s.activeTabId)?.filePath ?? null,
        }),
      );
    } catch {
      // localStorage 不可用时跳过
    }
  },

  async closeAllTabs() {
    const s = get();
    if (s.tabs.length === 0) return;
    if (!await confirmClosingTabs(s, s.tabs)) return;
    get().closeAllTabsNow();
  },

  closeAllTabsNow() {
    set(() => {
      syncSessionAndWatcher([], null);
      scrollPositions.clear();
      return { tabs: [], activeTabId: null };
    });
  },

  moveTab(id, targetId) {
    if (id === targetId) return;
    set((s) => {
      const from = s.tabs.findIndex((t) => t.id === id);
      const to = s.tabs.findIndex((t) => t.id === targetId);
      if (from < 0 || to < 0) return s;
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(from, 1);
      tabs.splice(to, 0, moved);
      syncSessionAndWatcher(tabs, s.activeTabId);
      return { tabs };
    });
  },

  async setActive(id) {
    if (id !== get().activeTabId && !await confirmLeaveActiveDirty(get(), id)) return;
    const before = get().tabs.find((t) => t.id === id);
    set((s) => {
      saveSession(s.tabs, id);
      return { activeTabId: id };
    });
    // 后台打开的标签（会话恢复/批量打开）不走首屏高亮；
    // 第一次切到它时补上，避免代码块一直停留在无色状态。
    if (before && !before.highlightComplete) {
      scheduleHighlight(set, id, before.html);
    }
    // 恢复会话时隐藏标签只读了路径；第一次切到它时再补内容，首屏不必等全部标签构建完。
    const tab = get().tabs.find((t) => t.id === id);
    if (tab?.isLazy) {
      set((s) => ({
        tabs: s.tabs.map((t) => (
          t.id === id ? { ...t, isLazy: false, isLoading: true } : t
        )),
      }));
      // 切入懒加载标签前，setActive 已完成脏草稿确认；这里不再重复弹窗。
      void get().reloadTab(id, { skipDiscardConfirm: true });
    }
  },

  setScrollTop(id, scrollTop) {
    scrollPositions.set(id, scrollTop);
  },

  getScrollTop(id) {
    return scrollPositions.get(id) ?? 0;
  },

  updateSource(id, source, rendered) {
    set((s) => ({
      tabs: s.tabs.map((t) => (
        t.id === id
          ? {
              ...t,
              source,
              html: rendered.html,
              toc: rendered.toc,
              highlightComplete: !hasCodeBlocks(rendered.html),
            }
          : t
      )),
    }));
    scheduleHighlight(set, id, rendered.html);
  },

  async reloadTab(id, options) {
    // 手动刷新会用磁盘内容替换正文；编辑中的脏草稿必须先确认。
    if (!options?.skipDiscardConfirm && !await confirmDiscardDirty(get(), id, '刷新')) return;
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    // 重载时显示 loading 状态
    set((s) => ({
      tabs: s.tabs.map((t) => (
        t.id === id ? { ...t, isLoading: true, isLazy: false } : t
      )),
    }));
    try {
      const next = await buildTab(tab.filePath);
      set((s) => ({
        tabs: s.tabs.map((t) => (
          t.id === id
            ? { ...next, id, tocExpanded: t.tocExpanded, isLoading: false, isLazy: false }
            : t
        )),
        activeTabId: s.activeTabId,
      }));
      // 刷新已获用户确认（或该标签本就没有草稿）：磁盘内容现在是新的基线。
      // 让编辑器同步新正文，而不是继续显示刚刚同意丢弃的旧草稿。
      if (get().activeTabId === id && useEditStore.getState().isEditing) {
        useEditStore.getState().setDirty(false);
      }
      if (get().activeTabId === id) scheduleHighlight(set, id, next.html);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const hadContent = Boolean(tab.source || tab.html);
      // 懒加载标签首次激活时没有旧内容可保留，显示可诊断错误；
      // 手动刷新已有内容时保留旧正文，避免一次临时读取失败清空阅读页。
      set((s) => ({
        tabs: s.tabs.map((t) => (
          t.id === id
            ? {
                ...t,
                isLoading: false,
                isLazy: false,
                ...(hadContent
                  ? {}
                  : {
                      loadError: errorMsg,
                      highlightComplete: true,
                      html: `<div class="mermaid-error" role="note">打开文件失败：${escapeHtml(errorMsg)}</div>`,
                      toc: [],
                    }),
              }
            : t
        )),
      }));
      if (hadContent) {
        useToastStore.getState().push(`刷新失败:${errorMsg}`, 'error');
      }
    }
  },

  async restoreSession() {
    // 无痕会话：不恢复，并顺手清掉开启前遗留的旧会话数据
    if (useEphemeralStore.getState().enabled) {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {
        // localStorage 不可用时无数据可清
      }
      return;
    }
    if (get().tabs.length > 0) return;
    const session = readSession();
    if (!session?.paths.length) return;
    const userOpensBeforeRestore = userOpenCount;
    const normalizedActive = session.activePath ? normalizePathKey(session.activePath) : null;
    const targetIndex = normalizedActive
      ? session.paths.findIndex((path) => normalizePathKey(path) === normalizedActive)
      : -1;
    const activeIndex = targetIndex >= 0 ? targetIndex : session.paths.length - 1;
    const normalizedPaths = session.paths.map((path) => (
      isWindows() ? path.replace(/\//g, '\\') : path
    ));
    const restored: Tab[] = normalizedPaths.map((normalized, index) => {
      return {
        id: `tab-${++seq}`,
        filePath: normalized,
        fileName: normalized.split(/[/\\]/).pop() || normalized,
        source: '',
        html: '',
        highlightComplete: true,
        toc: [],
        tocExpanded: {},
        isLoading: index !== activeIndex,
        isLazy: index !== activeIndex,
      };
    });
    // 只有当前可见标签立即构建；其余标签保留占位，首次激活时再读取。
    const activeId = restored[activeIndex]?.id ?? null;
    set({ tabs: restored, activeTabId: activeId });
    // 恢复骨架先不重建 watcher；等确认无人介入后一次性登记全部路径。
    saveSession(restored, activeId);
    // 让用户/二次启动路径有机会插入新标签；有介入则保留双方标签，
    // 但不把活跃焦点抢回旧会话。
    await new Promise((resolve) => setTimeout(resolve, 0));
    // 恢复期间用户主动打开过文件（如二次启动转发、对话框选择、双击打开），
    // 落盘当前状态后让位，不把 active 抢回旧会话的 tab
    if (userOpenCount !== userOpensBeforeRestore) {
      // 恢复过程中用户打开过文件：保留当前标签顺序与焦点，不再把
      // userOpenedTabs 前插一次（那样会让同一个新标签出现两次）。
      // 旧会话中的占位（包括原本要立即读取的 active）统一改为懒加载，
      // 避免恢复流程在后台抢读；若用户恰好切回了某个旧标签，再补读它。
      const restoredIds = new Set(restored.map((t) => t.id));
      const afterUser = get().tabs.map((t) => (
        restoredIds.has(t.id) && !t.source && !t.html
          ? { ...t, isLoading: false, isLazy: true }
          : t
      ));
      const currentActiveId = get().activeTabId;
      set({ tabs: afterUser, activeTabId: currentActiveId });
      saveSession(afterUser, currentActiveId);
      syncWatcherFromTabs(afterUser);
      if (currentActiveId && restoredIds.has(currentActiveId)) {
        void get().setActive(currentActiveId);
      }
      return;
    }
    set({ activeTabId: activeId });
    saveSession(get().tabs, activeId);
    syncWatcherFromTabs(get().tabs);
    // 只读取真正可见的标签；其余保持占位，切到再加载。
    if (activeId) {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === activeId ? { ...t, isLazy: false } : t)),
      }));
      void get().reloadTab(activeId);
    }
  },
}));

/** 供测试隔离滚动缓存（生产代码无需调用） */
export function resetScrollPositionsForTests(): void {
  scrollPositions.clear();
}
