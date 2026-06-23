import { create } from 'zustand';
import type { Revision, RevisionHunk } from '../types';
import { segmentHunks, groupChangeSegments } from '../utils/diff';

interface RevisionState {
  // --- State ---
  isRevisionMode: boolean;
  revisions: Revision[];
  currentRevisionId: string | null;
  /** 当前 revision 内的变更点索引（segment 粒度，从 0 开始） */
  currentSegmentIndex: number;
  snapshotSource: string;

  // --- Actions ---
  enableRevisionMode: (source: string) => void;
  disableRevisionMode: () => void;
  addRevision: (oldSource: string, newSource: string, hunks: RevisionHunk[]) => void;
  /** 下一个变更点：当前 revision 内推进，到末尾则跳到下一条 revision 的首块 */
  navigateNext: () => void;
  /** 上一个变更点：当前 revision 内回退，到开头则跳到上一条 revision 的末块 */
  navigatePrev: () => void;
  setCurrentRevision: (id: string) => void;
}

let revSeq = 0;

/** 统一计算某条 revision 的变更点总数 */
export function countChangeSegments(hunks: RevisionHunk[]): number {
  return groupChangeSegments(segmentHunks(hunks)).length;
}

export const useRevisionStore = create<RevisionState>((set, get) => ({
  isRevisionMode: false,
  revisions: [],
  currentRevisionId: null,
  currentSegmentIndex: 0,
  snapshotSource: '',

  enableRevisionMode: (source) => set({
    isRevisionMode: true,
    snapshotSource: source,
    revisions: [],
    currentRevisionId: null,
    currentSegmentIndex: 0,
  }),

  disableRevisionMode: () => set({
    isRevisionMode: false,
    revisions: [],
    currentRevisionId: null,
    currentSegmentIndex: 0,
    snapshotSource: '',
  }),

  addRevision: (oldSource, newSource, hunks) => {
    const id = `rev-${++revSeq}`;
    const revision: Revision = {
      id,
      timestamp: Date.now(),
      oldSource,
      newSource,
      hunks,
    };
    set(state => {
      const revisions = [...state.revisions, revision];
      return { revisions, currentRevisionId: id, currentSegmentIndex: 0 };
    });
  },

  navigateNext: () => {
    const { currentRevisionId, revisions, currentSegmentIndex } = get();
    const idx = revisions.findIndex(r => r.id === currentRevisionId);
    if (idx < 0) return;
    const cur = revisions[idx];
    const segCount = countChangeSegments(cur.hunks);
    if (currentSegmentIndex < segCount - 1) {
      set({ currentSegmentIndex: currentSegmentIndex + 1 });
    } else if (idx < revisions.length - 1) {
      // 跳到下一条 revision 的第一个变更点
      set({ currentRevisionId: revisions[idx + 1].id, currentSegmentIndex: 0 });
    }
  },

  navigatePrev: () => {
    const { currentRevisionId, revisions, currentSegmentIndex } = get();
    const idx = revisions.findIndex(r => r.id === currentRevisionId);
    if (idx < 0) return;
    if (currentSegmentIndex > 0) {
      set({ currentSegmentIndex: currentSegmentIndex - 1 });
    } else if (idx > 0) {
      // 跳到上一条 revision 的最后一个变更点
      const prev = revisions[idx - 1];
      set({ currentRevisionId: prev.id, currentSegmentIndex: countChangeSegments(prev.hunks) - 1 });
    }
  },

  setCurrentRevision: (id) => set({ currentRevisionId: id, currentSegmentIndex: 0 }),
}));
