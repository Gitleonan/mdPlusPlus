import { useEffect } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useTabsStore } from '../stores/tabsStore';
import { pickMdFiles } from '../ipc/system';

const MD_EXT = /\.(md|markdown)$/i;

/** 拖拽 + 文件对话框打开文件 hook */
export function useOpenFile() {
  const openTab = useTabsStore((s) => s.openTab);

  // 拖拽
  useEffect(() => {
    // Tauri IPC 缺失(纯浏览器调试)时跳过事件监听,避免挂载即崩溃
    let webview: ReturnType<typeof getCurrentWebview>;
    try {
      webview = getCurrentWebview();
    } catch {
      console.warn('[openFile] Tauri IPC 不可用,拖拽打开已禁用');
      return;
    }
    const unlisten = webview.onDragDropEvent(async (e) => {
      console.log('[openFile] drag-drop event:', e.payload);
      if (e.payload.type === 'drop') {
        const paths = (e.payload.paths || []).filter((p: string) => MD_EXT.test(p));
        console.log('[openFile] filtered md paths:', paths);
        for (const p of paths) {
          try {
            await openTab(p);
          } catch (err) {
            console.error('[openFile] openTab failed for', p, err);
          }
        }
      }
    });
    return () => { unlisten.then((u) => u()); };
  }, [openTab]);
}

/** 通过文件对话框打开 */
export async function openViaDialog() {
  console.log('[openViaDialog] opening file dialog...');
  try {
    const paths = await pickMdFiles();
    console.log('[openViaDialog] selected paths:', paths);
    if (!paths) return;
    for (const p of paths) {
      try {
        await useTabsStore.getState().openTab(p);
      } catch (err) {
        console.error('[openViaDialog] openTab failed for', p, err);
      }
    }
  } catch (err) {
    console.error('[openViaDialog] pickMdFiles failed:', err);
  }
}
