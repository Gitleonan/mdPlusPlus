import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, RotateCw, Download, Sun, Moon, Pencil, Eye, Palette, Info, X, ScanEye, GitCompareArrows } from 'lucide-react';
import { useTabsStore } from '../../stores/tabsStore';
import { useThemeStore } from '../../stores/themeStore';
import { useEditStore } from '../../stores/editStore';
import { useZenStore } from '../../stores/zenStore';
import { useRevisionStore } from '../../stores/revisionStore';
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

const iconSize = 14;

export function TitleBar({ onExport, onAbout, onThemeManager }: TitleBarProps) {
  const {
    tabs,
    activeTabId,
    setActive,
    closeTab,
    closeTabsToLeft,
    closeTabsToRight,
    closeOtherTabs,
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
  const isMonitoring = useRevisionStore(s => s.isRevisionMode);
  const enableRevisionMode = useRevisionStore(s => s.enableRevisionMode);
  const disableRevisionMode = useRevisionStore(s => s.disableRevisionMode);
  const [menu, setMenu] = useState<TabMenuState | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const menuTab = menu ? tabs.find((t) => t.id === menu.tabId) : null;

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  const copyPath = async (path: string) => {
    await navigator.clipboard.writeText(path);
  };

  const runMenuAction = (action: () => void | Promise<void>) => {
    setMenu(null);
    Promise.resolve(action()).catch((err) => console.error('[tab menu] action failed', err));
  };

  const handleToggleMonitoring = () => {
    if (isMonitoring) {
      disableRevisionMode();
    } else if (activeTab) {
      enableRevisionMode(activeTab.source);
    }
  };

  return (
    <header className="titlebar">
      <button className="titlebar-open-btn" onClick={openViaDialog} title="打开文件 (Ctrl+O)">
        <Plus className="titlebar-icon" size={iconSize} strokeWidth={1.5} />
      </button>
      <div className="titlebar-tabs">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`titlebar-tab ${t.id === activeTabId ? 'active' : ''} ${t.id === draggingTabId ? 'dragging' : ''}`}
            draggable
            onClick={() => setActive(t.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActive(t.id);
              setMenu({ tabId: t.id, x: e.clientX, y: e.clientY });
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
            <span className="titlebar-tab-name">{t.fileName}</span>
            <button
              className="titlebar-tab-close"
              onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
              aria-label="关闭"
            >
              <X size={12} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
      <div className="titlebar-tools">
        {/* 1. 监听变更 — Framer Motion 驱动 switch 按钮 */}
        <motion.button
          className="titlebar-switch-btn"
          onClick={handleToggleMonitoring}
          disabled={!activeTab}
          aria-label={isMonitoring ? '停止监听变更' : '开始监听变更'}
          title={isMonitoring ? '停止监听变更 (Ctrl+Shift+R)' : '监听变更 (Ctrl+Shift+R)'}
          whileHover={!activeTab ? undefined : { scale: 1.04 }}
          whileTap={!activeTab ? undefined : { scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          {/* 图标 */}
          <motion.span
            className={isMonitoring ? 'switch-icon-on' : ''}
            animate={isMonitoring ? { rotate: [0, 15, 0] } : { rotate: 0 }}
            transition={{
              duration: isMonitoring ? 3.6 : 0.25,
              repeat: isMonitoring ? Infinity : 0,
              ease: [0.32, 0.72, 0, 1],
            }}
            style={{ display: 'inline-flex', alignItems: 'center' }}
          >
            <GitCompareArrows size={iconSize} strokeWidth={1} />
          </motion.span>

          {/* 文字标签 */}
          <AnimatePresence mode="wait">
            <motion.span
              key={isMonitoring ? 'on' : 'off'}
              className={isMonitoring ? 'switch-label-on' : ''}
              initial={{ opacity: 0, y: 6, filter: 'blur(2px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, filter: 'blur(2px)' }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            >
              {isMonitoring ? '监听中' : '监听变更'}
            </motion.span>
          </AnimatePresence>
        </motion.button>

        {/* 2. Zen 模式 */}
        <button
          className={`titlebar-tool-btn titlebar-icon-btn ${isZen ? 'titlebar-tool-active' : ''}`}
          onClick={toggleZen}
          aria-label={isZen ? '退出专注模式' : '专注模式'}
          title={isZen ? '退出专注模式 (Ctrl+Shift+Z)' : '专注模式 (Ctrl+Shift+Z)'}
        >
          <ScanEye size={iconSize} strokeWidth={1.5} />
        </button>

        {/* 3. 编辑模式 */}
        <button
          className={`titlebar-tool-btn titlebar-icon-btn ${isEditing ? 'titlebar-tool-active' : ''}`}
          onClick={toggleEditing}
          disabled={!activeTab}
          aria-label={isEditing ? '切换到预览模式' : '切换到编辑模式'}
          title={isEditing ? '预览模式 (Ctrl+E)' : '编辑模式 (Ctrl+E)'}
        >
          {isEditing
            ? <Eye size={iconSize} strokeWidth={1.5} />
            : <Pencil size={iconSize} strokeWidth={1.5} />
          }
        </button>

        {/* 4. 刷新 */}
        <button
          className="titlebar-tool-btn titlebar-icon-btn"
          onClick={() => activeTab && reloadTab(activeTab.id)}
          disabled={!activeTab}
          aria-label="重新载入当前文件"
          title="重新载入当前文件"
        >
          <RotateCw size={iconSize} strokeWidth={1.5} />
        </button>

        {/* 导出 */}
        {activeTab && (
          <button
            className="titlebar-tool-btn"
            onClick={onExport}
            title={isEditing ? '预览模式下才可导出' : '导出 (Ctrl+P)'}
            disabled={isEditing}
          >
            <Download size={iconSize} strokeWidth={1.5} />
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
            ? <Sun size={iconSize} strokeWidth={1.5} />
            : <Moon size={iconSize} strokeWidth={1.5} />
          }
        </button>

        {/* 6. 主题切换 */}
        <button
          className="titlebar-tool-btn titlebar-icon-btn"
          onClick={onThemeManager}
          aria-label="自定义主题"
          title="自定义主题"
        >
          <Palette size={iconSize} strokeWidth={1.5} />
        </button>

        {/* 7. 关于 */}
        <button
          className="titlebar-tool-btn titlebar-icon-btn"
          onClick={onAbout}
          aria-label="关于 md++"
          title="关于 md++"
        >
          <Info size={iconSize} strokeWidth={1.5} />
        </button>
      </div>
      {menu && menuTab && (
        <div
          className="tab-context-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button role="menuitem" onClick={() => runMenuAction(() => closeTab(menuTab.id))}>关闭当前</button>
          <button role="menuitem" onClick={() => runMenuAction(() => closeTabsToLeft(menuTab.id))}>关闭左侧</button>
          <button role="menuitem" onClick={() => runMenuAction(() => closeTabsToRight(menuTab.id))}>关闭右侧</button>
          <button role="menuitem" onClick={() => runMenuAction(() => closeOtherTabs(menuTab.id))}>关闭其他</button>
          <div className="tab-context-menu-separator" />
          <button role="menuitem" onClick={() => runMenuAction(() => openContainingFolder(menuTab.filePath))}>打开所在位置</button>
          <button role="menuitem" onClick={() => runMenuAction(() => copyPath(menuTab.filePath))}>复制文件路径</button>
        </div>
      )}
    </header>
  );
}
