import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { listen } from '@tauri-apps/api/event';
import { TitleBar } from './components/TitleBar/TitleBar';
import { Sidebar } from './components/Sidebar/Sidebar';
import { Content } from './components/Content/Content';
import { Editor } from './components/Editor/Editor';
import { Welcome } from './components/Welcome/Welcome';
import { SearchBar } from './components/SearchBar/SearchBar';
import { Lightbox } from './components/Lightbox/Lightbox';
import { ExportPdfModal } from './components/ExportPdfModal/ExportPdfModal';
import { AboutModal } from './components/AboutModal/AboutModal';
import { ThemeManager } from './components/ThemeManager/ThemeManager';
import { useTabsStore } from './stores/tabsStore';
import { useEditStore } from './stores/editStore';
import { useZenStore } from './stores/zenStore';
import { useCustomThemeStore } from './stores/customThemeStore';
import { useOpenFile } from './hooks/useOpenFile';
import { useThemeInit } from './features/theme/useThemeInit';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useRevisionShortcuts } from './hooks/useRevisionShortcuts';
import { useRevisionStore } from './stores/revisionStore';
import { useFileWatcher } from './features/fileWatch/useFileWatcher';
import { useRecentStore } from './stores/recentStore';
import { useThemeStore } from './stores/themeStore';
import { exportDocument, type ExportFormat } from './features/export/export';

export default function App() {
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [themeManagerOpen, setThemeManagerOpen] = useState(false);

  useOpenFile();
  useThemeInit();
  useFileWatcher();
  useRevisionShortcuts();

  const contentRef = useRef<HTMLDivElement>(null);
  const hasTabs = useTabsStore((s) => s.tabs.length > 0);
  const activeTab = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const isEditing = useEditStore((s) => s.isEditing);
  const isZen = useZenStore((s) => s.isZen);
  const disableZen = useZenStore((s) => s.disable);
  const record = useRecentStore((s) => s.record);
  const resolvedTheme = useThemeStore((s) => s.resolved);

  const loadRecent = useRecentStore((s) => s.load);
  const restoreSession = useTabsStore((s) => s.restoreSession);
  const loadThemes = useCustomThemeStore((s) => s.loadThemes);

  const requestExport = useCallback(() => {
    if (!contentRef.current) return;
    setExportModalOpen(true);
  }, []);

  const performExport = useCallback(async (format: ExportFormat) => {
    if (!contentRef.current || !activeTab) return;
    await exportDocument({
      element: contentRef.current,
      source: activeTab.source,
      fileName: activeTab.fileName,
      theme: resolvedTheme,
      format,
    });
  }, [activeTab, resolvedTheme]);

  useGlobalShortcuts({ onExportPdf: requestExport });

  // 恢复刷新前打开的标签 + 自定义主题
  useEffect(() => {
    loadRecent();
    restoreSession();
    loadThemes();
  }, [loadRecent, restoreSession, loadThemes]);

  // 命令行参数打开文件
  useEffect(() => {
    const unlisten = listen<string[]>('open-on-startup', async (e) => {
      for (const p of e.payload) await useTabsStore.getState().openTab(p);
    });
    return () => { unlisten.then((u) => u()); };
  }, []);

  // 记录最近文件
  useEffect(() => {
    if (activeTab) record(activeTab.filePath, activeTab.fileName);
  }, [activeTab?.id, record]);

  // 切换 tab 时退出编辑模式和修订模式
  useEffect(() => {
    useEditStore.getState().reset();
    useRevisionStore.getState().disableRevisionMode();
  }, [activeTab?.id]);

  // Zen 模式下 ESC 退出
  useEffect(() => {
    if (!isZen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') disableZen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isZen, disableZen]);

  return (
    <div className={`app ${isZen ? 'app-zen' : ''}`}>
      {!isZen && <TitleBar
        onExport={requestExport}
        onAbout={() => setAboutOpen(true)}
        onThemeManager={() => setThemeManagerOpen(true)}
      />}
      {hasTabs && activeTab && !isEditing && !isZen && <SearchBar contentRef={contentRef} />}
      <div className="app-body">
        {hasTabs && activeTab && !isZen && <Sidebar toc={activeTab.toc} activeId={activeHeadingId} />}
        <AnimatePresence mode="wait">
          {hasTabs ? (
            isEditing ? (
              <motion.div
                key="editor"
                style={{ flex: 1, display: 'flex', minWidth: 0 }}
                initial={{ opacity: 0, filter: 'blur(4px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, filter: 'blur(4px)' }}
                transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
              >
                <Editor />
              </motion.div>
            ) : (
              <motion.div
                key="preview"
                style={{ flex: 1, display: 'flex', minWidth: 0 }}
                initial={{ opacity: 0, filter: 'blur(4px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, filter: 'blur(4px)' }}
                transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
              >
                <Content contentRef={contentRef} onActiveHeadingChange={setActiveHeadingId} />
              </motion.div>
            )
          ) : (
            <Welcome />
          )}
        </AnimatePresence>
      </div>
      <Lightbox />
      <ExportPdfModal
        open={exportModalOpen}
        fileName={activeTab?.fileName ?? null}
        onConfirm={performExport}
        onClose={() => setExportModalOpen(false)}
      />
      <AboutModal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
      />
      <ThemeManager
        open={themeManagerOpen}
        onClose={() => setThemeManagerOpen(false)}
      />
    </div>
  );
}
