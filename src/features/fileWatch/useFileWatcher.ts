import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useTabsStore } from '../../stores/tabsStore';
import { useEditStore } from '../../stores/editStore';
import { useRevisionStore } from '../../stores/revisionStore';
import { readFile } from '../../ipc/files';
import { renderMarkdown } from '../markdown/render';
import { highlightCodeBlocks } from '../markdown/highlight';
import { extractToc } from '../markdown/toc';
import { computeLineDiff } from '../../utils/diff';

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

      // 当前主题（正常模式与修订模式共用）
      const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

      if (isRevisionMode) {
        for (const path of changedPaths) {
          const tab = tabs.find(
            (t: { filePath: string }) => t.filePath === path || t.filePath === path.replace(/\//g, '\\'),
          );
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
            const toc = extractToc(newSource);
            const html = await highlightCodeBlocks(renderMarkdown(newSource), theme);
            updateSource(tab.id, newSource, html, toc);
          } catch (err) {
            console.error('revision reload failed', err);
          }
        }
        return;
      }

      // --- 正常模式：直接刷新 ---
      for (const path of changedPaths) {
        const tab = tabs.find(
          (t: { filePath: string }) => t.filePath === path || t.filePath === path.replace(/\//g, '\\'),
        );
        if (!tab) continue;
        try {
          const source = await readFile(tab.filePath);
          if (source === tab.source) continue;
          const toc = extractToc(source);
          const html = await highlightCodeBlocks(renderMarkdown(source), theme);
          updateSource(tab.id, source, html, toc);
        } catch (err) {
          console.error('reload failed', err);
        }
      }
    });
    return () => { unlisten.then((u) => u()); };
  }, []);
}
