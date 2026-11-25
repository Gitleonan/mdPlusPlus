import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { normalizePathKey, useTabsStore } from '../../stores/tabsStore';
import { useEditStore } from '../../stores/editStore';
import { useRevisionStore } from '../../stores/revisionStore';
import { readFile } from '../../ipc/files';
import { renderMarkdownDocument } from '../markdown/render';
import { computeLineDiff } from '../../utils/diff';
import { useToastStore } from '../../stores/toastStore';

/** 监听 Rust 端 file-changed 事件，自动刷新被外部修改的文件 */
export function useFileWatcher() {
  useEffect(() => {
    const unlisten = listen<string[]>('file-changed', async (e) => {
      const changedPaths = e.payload;
      const { tabs, updateSource } = useTabsStore.getState();

      // 编辑模式保存后 2 秒内忽略文件变更事件，避免自我触发刷新
      const { lastSaveAt } = useEditStore.getState();
      if (Date.now() - lastSaveAt < 2000) return;

      // --- 修订模式：拦截变更，生成增量 diff ---
      const { isRevisionMode, snapshotSource, revisions, addRevision } =
        useRevisionStore.getState();

      if (isRevisionMode) {
        for (const path of changedPaths) {
          const key = normalizePathKey(path);
          const tab = tabs.find((t) => normalizePathKey(t.filePath) === key);
          if (!tab) continue;
          try {
            const newSource = await readFile(tab.filePath);

            // 计算 diff 的基线：有修订记录时，以最后一个修订的新内容为基线（增量对比）；
            // 否则以进入修订模式时的快照为基线
            const lastRev = revisions.length > 0 ? revisions[revisions.length - 1] : null;
            const baseline = lastRev ? lastRev.newSource : snapshotSource;

            if (newSource === baseline) continue;

            // 计算增量 diff（相对于上一次修订或快照）
            const hunks = computeLineDiff(baseline, newSource);
            addRevision(baseline, newSource, hunks);

            // 同步刷新 tab 的源码、HTML 与 TOC：修订预览由 revisionStore 渲染 diff，
            // 但侧边栏目录订阅 tab.toc，必须随最新内容更新；退出修订模式后也能直接显示最新内容
            const rendered = renderMarkdownDocument(newSource);
            updateSource(tab.id, newSource, rendered);
          } catch (err) {
            console.error('revision reload failed', err);
          }
        }
        return;
      }

      // --- 正常模式：直接刷新 ---
      for (const path of changedPaths) {
        const key = normalizePathKey(path);
        const tab = tabs.find((t) => normalizePathKey(t.filePath) === key);
        if (!tab) continue;
        // 编辑中的草稿不能因为外部保存/自动格式化而被悄悄替换。
        // 保留草稿在编辑器里，提示用户自行保存或刷新，避免被动丢改动。
        if (
          useEditStore.getState().isEditing
          && useEditStore.getState().isDirty
          && useTabsStore.getState().activeTabId === tab.id
        ) {
          useToastStore.getState().push(
            `「${tab.fileName}」在磁盘上已变更；当前未保存草稿已保留`,
            'info',
          );
          continue;
        }
        try {
          const source = await readFile(tab.filePath);
          if (source === tab.source) continue;
          const rendered = renderMarkdownDocument(source);
          updateSource(tab.id, source, rendered);
        } catch (err) {
          console.error('reload failed', err);
        }
      }
    });
    return () => { unlisten.then((u) => u()); };
  }, []);
}
