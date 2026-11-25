import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, RotateCw, Download, Sun, Moon, Pencil, Eye, Palette, Info, X, ScanEye, GitCompareArrows, Ghost, MoreHorizontal, ArrowUpCircle, FileText } from 'lucide-react';
import { useTabsStore } from '../../stores/tabsStore';
import { useThemeStore } from '../../stores/themeStore';
import { useEditStore } from '../../stores/editStore';
import { useZenStore } from '../../stores/zenStore';
import { useEphemeralStore } from '../../stores/ephemeralStore';
import { useRevisionStore } from '../../stores/revisionStore';
import { useUpdateStore } from '../../stores/updateStore';
import { openViaDialog } from '../../hooks/useOpenFile';
import { openContainingFolder } from '../../ipc/opener';

interface TitleBarProps {
  onExport: () => void;
  onAbout: () => void;
  onThemeManager: () => void;
}

interface TabMenuState {
  tabId: string;
  x: number;
  y: number;
}

interface SimpleMenuState {
  x: number;
  y: number;
}

const iconSize = 14;

/** 菜单定位:按视口钳制,防止贴边按钮(如「更多」)的菜单溢出窗口被裁剪。
 *  估算高度:菜单项 × 30px + padding + 分隔线,足够 7 项的 tab 菜单与 3 项的更多菜单。 */
function clampMenuToViewport(x: number, y: number, itemCount: number, hasSeparator: boolean): { x: number; y: number } {
  const EST_ITEM_H = 30;
  const EST_EXTRA = 22;
  const estH = itemCount * EST_ITEM_H + (hasSeparator ? 10 : 0) + EST_EXTRA;
  const estW = 180; // min-width 160 + padding
  const flipX = x + estW > window.innerWidth - 8;
  const flipY = y + estH > window.innerHeight - 8;
  return {
    x: flipX ? Math.max(8, x - estW) : x,
    y: flipY ? Math.max(8, y - estH) : y,
  };
}

export function TitleBar({ onExport, onAbout, onThemeManager }: TitleBarProps) {
  const {
    tabs,
    activeTabId,
    setActive,
    closeTab,
    closeTabsToLeft,
    closeTabsToRight,
    closeOtherTabs,
    closeAllTabs,
    moveTab,
    reloadTab,
  } = useTabsStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const resolved = useThemeStore((s) => s.resolved);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const isEditing = useEditStore((s) => s.isEditing);
  const toggleEditing = useEditStore((s) => s.toggleEditing);
  const isZen = useZenStore((s) => s.isZen);
  const toggleZen = useZenStore((s) => s.toggle);
  const isEphemeral = useEphemeralStore((s) => s.enabled);
  const toggleEphemeral = useEphemeralStore((s) => s.toggle);
  const isMonitoring = useRevisionStore(s => s.isRevisionMode);
  const enableRevisionMode = useRevisionStore(s => s.enableRevisionMode);
  const disableRevisionMode = useRevisionStore(s => s.disableRevisionMode);
  const updateStatus = useUpdateStore((s) => s.status);
  const updateVersion = useUpdateStore((s) => s.info?.version ?? null);
  const openUpdateDialog = useUpdateStore((s) => s.openDialog);
  const hasUpdate = updateStatus === 'available' && updateVersion !== null;
  const [menu, setMenu] = useState<TabMenuState | null>(null);
  const [moreMenu, setMoreMenu] = useState<SimpleMenuState | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const menuTab = menu ? tabs.find((t) => t.id === menu.tabId) : null;

  useEffect(() => {
    if (!menu && !moreMenu) return;
    const close = () => { setMenu(null); setMoreMenu(null); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('blur', close);
    };
  }, [menu, moreMenu]);

  const copyPath = async (path: string) => {
    await navigator.clipboard.writeText(path);
  };

  const runMenuAction = (action: () => void | Promise<void>) => {
    setMenu(null);
    Promise.resolve(action()).catch((err) => console.error('[tab menu] action failed', err));
  };

  const handleToggleMonitoring = async () => {
    if (isMonitoring) {
      disableRevisionMode();
    } else if (activeTab) {
      enableRevisionMode(activeTab.source);
    }
  };

  const menuMotion = {
    initial: { opacity: 0, y: -2 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -2 },
    transition: { duration: 0.14, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] },
  };

  return (
    <header className="titlebar">
      <button
        className="titlebar-open-btn"
        onClick={openViaDialog}
        title="打开文件 (Ctrl+O)"
        aria-label="打开文件"
      >
        <Plus className="titlebar-icon" size={iconSize} strokeWidth={1.7} />
      </button>
      <div className="titlebar-tabs">
        {tabs.map((t) => {
          const isActive = t.id === activeTabId;
          return (
            <div
              key={t.id}
              className={`titlebar-tab ${isActive ? 'active' : ''} ${t.id === draggingTabId ? 'dragging' : ''}`}
              draggable
              onClick={() => { void setActive(t.id); }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void setActive(t.id).then(() => {
                  if (useTabsStore.getState().activeTabId !== t.id) return;
                  const { x, y } = clampMenuToViewport(e.clientX, e.clientY, 7, true);
                  setMenu({ tabId: t.id, x, y });
                });
              }}
              onDragStart={(e) => {
                setDraggingTabId(t.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', t.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const sourceId = e.dataTransfer.getData('text/plain') || draggingTabId;
                if (sourceId) moveTab(sourceId, t.id);
                setDraggingTabId(null);
              }}
              onDragEnd={() => setDraggingTabId(null)}
            >
              {isActive && (
                <motion.span
                  layoutId="titlebar-active-tab-pill"
                  className="titlebar-tab-active-bg"
                  transition={{ type: 'spring', stiffness: 460, damping: 34, mass: 0.8 }}
                />
              )}
              <FileText className="titlebar-tab-icon" size={12} strokeWidth={1.7} aria-hidden="true" />
              <span className="titlebar-tab-name">{t.fileName}</span>
              <button
                className="titlebar-tab-close"
                onClick={(e) => { e.stopPropagation(); void closeTab(t.id); }}
                aria-label="关闭"
              >
                <X size={11} strokeWidth={2} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="titlebar-tools">
        {/* 1. 监听变更 */}
        <button
          className={`titlebar-switch-btn ${isMonitoring ? 'titlebar-switch-btn-on' : ''}`}
          onClick={() => { void handleToggleMonitoring(); }}
          disabled={!activeTab}
          aria-label={isMonitoring ? '停止监听变更' : '开始监听变更'}
          title={isMonitoring ? '停止监听变更 (Ctrl+Shift+R)' : '监听变更 (Ctrl+Shift+R)'}
        >
          <span className={isMonitoring ? 'switch-icon-on' : ''} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <GitCompareArrows size={iconSize} strokeWidth={1.5} />
          </span>
          <span className={isMonitoring ? 'switch-label-on' : ''}>
            {isMonitoring ? '监听中' : '监听变更'}
          </span>
        </button>

        <span className="titlebar-sep" aria-hidden="true" />

        {/* 2. Zen 模式 */}
        <button
          className={`titlebar-tool-btn titlebar-icon-btn ${isZen ? 'titlebar-tool-active' : ''}`}
          onClick={toggleZen}
          aria-label={isZen ? '退出专注模式' : '专注模式'}
          title={isZen ? '退出专注模式 (Ctrl+Shift+Z)' : '专注模式 (Ctrl+Shift+Z)'}
        >
          <ScanEye size={iconSize} strokeWidth={1.6} />
        </button>

        {/* 3. 编辑模式 */}
        <button
          className={`titlebar-tool-btn titlebar-icon-btn ${isEditing ? 'titlebar-tool-active' : ''}`}
          onClick={() => { void toggleEditing(); }}
          disabled={!activeTab || (!isEditing && Boolean(activeTab.loadError))}
          aria-label={isEditing ? '切换到预览模式' : '切换到编辑模式'}
          title={
            !isEditing && activeTab?.loadError
              ? '文件读取失败，无法编辑'
              : isEditing ? '预览模式 (Ctrl+E)' : '编辑模式 (Ctrl+E)'
          }
        >
          {isEditing
            ? <Eye size={iconSize} strokeWidth={1.6} />
            : <Pencil size={iconSize} strokeWidth={1.6} />
          }
        </button>

        {/* 4. 刷新 */}
        <button
          className="titlebar-tool-btn titlebar-icon-btn"
          onClick={() => { if (activeTab) void reloadTab(activeTab.id); }}
          disabled={!activeTab}
          aria-label="重新载入当前文件"
          title="重新载入当前文件"
        >
          <RotateCw size={iconSize} strokeWidth={1.6} />
        </button>

        {/* 导出 */}
        {activeTab && (
          <button
            className="titlebar-tool-btn titlebar-export-btn"
            onClick={onExport}
            title={isEditing ? '预览模式下才可导出' : '导出 (Ctrl+P)'}
            disabled={isEditing}
          >
            <Download size={iconSize} strokeWidth={1.6} />
            <span>导出</span>
          </button>
        )}

        {/* 5. 夜间模式 */}
        <button
          className="titlebar-tool-btn titlebar-icon-btn"
          onClick={toggleTheme}
          aria-label={resolved === 'dark' ? '切换到日间模式' : '切换到夜间模式'}
          title={resolved === 'dark' ? '切换到日间模式 (Ctrl+Shift+T)' : '切换到夜间模式 (Ctrl+Shift+T)'}
        >
          {resolved === 'dark'
            ? <Sun key="sun" className="theme-toggle-icon" size={iconSize} strokeWidth={1.6} />
            : <Moon key="moon" className="theme-toggle-icon" size={iconSize} strokeWidth={1.6} />
          }
        </button>

        {/* 文档操作 | 系统项 分组分隔 */}
        <span className="titlebar-sep" aria-hidden="true" />

        {/* 有新版本：低调胶囊,点击才展开更新弹窗,不打断阅读 */}
        <AnimatePresence>
          {hasUpdate && (
            <motion.button
              className="update-pill"
              onClick={openUpdateDialog}
              title={`发现新版本 v${updateVersion},点击查看`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
            >
              <ArrowUpCircle size={12} strokeWidth={2} />
              v{updateVersion}
            </motion.button>
          )}
        </AnimatePresence>

        {/* 6. 更多(主题管理 / 无痕会话 / 关于 收纳进溢出菜单) */}
        <button
          className={`titlebar-tool-btn titlebar-icon-btn ${moreMenu ? 'titlebar-tool-active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            const { x, y } = clampMenuToViewport(e.clientX, e.clientY, 3, true);
            setMoreMenu({ x, y });
          }}
          aria-label="更多选项"
          aria-haspopup="menu"
          title="更多选项"
        >
          <MoreHorizontal size={iconSize} strokeWidth={1.6} />
        </button>

        {/* 无痕会话进行中:常驻胶囊,点击快速退出 */}
        <AnimatePresence>
          {isEphemeral && (
            <motion.button
              className="ephemeral-pill"
              onClick={toggleEphemeral}
              aria-pressed="true"
              title="无痕会话进行中——关闭软件不保留本次标签页。点击退出"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Ghost size={12} strokeWidth={1.6} />
              无痕
            </motion.button>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {moreMenu && (
            <motion.div
              className="tab-context-menu"
              style={{ left: moreMenu.x, top: moreMenu.y }}
              role="menu"
              {...menuMotion}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <button role="menuitem" onClick={() => { setMoreMenu(null); onThemeManager(); }}>
                <Palette size={13} strokeWidth={1.6} />
                自定义主题…
              </button>
              <button role="menuitem" onClick={() => { setMoreMenu(null); toggleEphemeral(); }}>
                <Ghost size={13} strokeWidth={1.6} />
                {isEphemeral ? '关闭无痕会话' : '开启无痕会话'}
              </button>
              <div className="tab-context-menu-separator" />
              <button role="menuitem" onClick={() => { setMoreMenu(null); onAbout(); }}>
                <Info size={13} strokeWidth={1.6} />
                关于 md++
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {menu && menuTab && (
          <motion.div
            className="tab-context-menu"
            style={{ left: menu.x, top: menu.y }}
            role="menu"
            {...menuMotion}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button role="menuitem" onClick={() => runMenuAction(() => closeTab(menuTab.id))}>关闭当前</button>
            <button role="menuitem" onClick={() => runMenuAction(() => closeTabsToLeft(menuTab.id))}>关闭左侧</button>
            <button role="menuitem" onClick={() => runMenuAction(() => closeTabsToRight(menuTab.id))}>关闭右侧</button>
            <button role="menuitem" onClick={() => runMenuAction(() => closeOtherTabs(menuTab.id))}>关闭其他</button>
            <button role="menuitem" onClick={() => runMenuAction(() => closeAllTabs())}>关闭全部</button>
            <div className="tab-context-menu-separator" />
            <button role="menuitem" onClick={() => runMenuAction(() => openContainingFolder(menuTab.filePath))}>打开所在位置</button>
            <button role="menuitem" onClick={() => runMenuAction(() => copyPath(menuTab.filePath))}>复制文件路径</button>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
