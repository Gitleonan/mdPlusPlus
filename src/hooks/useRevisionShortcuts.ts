import { useEffect } from 'react';
import { useRevisionStore } from '../stores/revisionStore';
import { useTabsStore } from '../stores/tabsStore';

/** Ctrl+Shift+R 切换监听变更模式 */
export function useRevisionShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        const { isRevisionMode, enableRevisionMode, disableRevisionMode } =
          useRevisionStore.getState();

        if (isRevisionMode) {
          disableRevisionMode();
        } else {
          const { tabs, activeTabId } = useTabsStore.getState();
          const activeTab = tabs.find(t => t.id === activeTabId);
          if (activeTab) {
            enableRevisionMode(activeTab.source);
          }
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
