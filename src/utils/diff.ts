import { diffLines, type Change } from 'diff';
import type { RevisionHunk } from '../types';

/**
 * 计算两段文本的行级 diff
 * @param oldText 旧文本
 * @param newText 新文本
 * @returns RevisionHunk[] 带行号的 diff 结果
 */
export function computeLineDiff(oldText: string, newText: string): RevisionHunk[] {
  const changes: Change[] = diffLines(oldText, newText);
  const hunks: RevisionHunk[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (const change of changes) {
    const lines = change.value.split('\n').filter((_, i, arr) =>
      i < arr.length - 1 || arr[arr.length - 1] !== ''
    );

    for (const line of lines) {
      if (change.added) {
        hunks.push({ type: 'added', content: line, newLineNo: newLine++ });
      } else if (change.removed) {
        hunks.push({ type: 'removed', content: line, oldLineNo: oldLine++ });
      } else {
        hunks.push({ type: 'unchanged', content: line, oldLineNo: oldLine++, newLineNo: newLine++ });
      }
    }
  }

  return hunks;
}

/** 渲染段落：连续同类 hunk 合并成一段 */
export type RevSegment =
  | { kind: 'unchanged'; source: string }
  | { kind: 'added'; source: string }
  | { kind: 'removed'; source: string };

export function segmentHunks(hunks: RevisionHunk[]): RevSegment[] {
  const segments: RevSegment[] = [];
  let buf: { kind: RevisionHunk['type']; lines: string[] } | null = null;
  const flush = () => {
    if (!buf) return;
    const source = buf.lines.join('\n');
    if (source !== '') segments.push({ kind: buf.kind, source });
    buf = null;
  };
  for (const h of hunks) {
    if (!buf || buf.kind !== h.type) {
      flush();
      buf = { kind: h.type, lines: [] };
    }
    buf.lines.push(h.content);
  }
  flush();
  return segments;
}

/**
 * 一个变更点 = 一组相邻的非 unchanged 段（removed 段 + 紧随的 added 段，或单独其一）。
 * 返回每个变更点包含的段索引列表（相对 segments 数组）。
 */
export function groupChangeSegments(segments: RevSegment[]): number[][] {
  const groups: number[][] = [];
  let cur: number[] = [];
  segments.forEach((seg, i) => {
    if (seg.kind === 'unchanged') {
      if (cur.length) { groups.push(cur); cur = []; }
    } else {
      cur.push(i);
    }
  });
  if (cur.length) groups.push(cur);
  return groups;
}
