import { describe, expect, it, beforeEach } from 'vitest';
import { MAX_REVISIONS, useRevisionStore } from './revisionStore';
import type { RevisionHunk } from '../types';

const hunk = (content: string): RevisionHunk => ({
  type: 'added',
  content,
  newLineNo: 1,
});

describe('revisionStore', () => {
  beforeEach(() => {
    useRevisionStore.setState({
      isRevisionMode: false,
      revisions: [],
      currentRevisionId: null,
      currentSegmentIndex: 0,
      snapshotSource: '',
    });
  });

  it('keeps a bounded number of revisions while preserving the latest one', () => {
    useRevisionStore.getState().enableRevisionMode('');
    for (let i = 0; i < MAX_REVISIONS + 5; i++) {
      useRevisionStore.getState().addRevision(`old ${i}`, `new ${i}`, [hunk(`line ${i}`)]);
    }
    const state = useRevisionStore.getState();
    expect(state.revisions).toHaveLength(MAX_REVISIONS);
    expect(state.revisions[state.revisions.length - 1]?.newSource).toBe(`new ${MAX_REVISIONS + 4}`);
    expect(state.currentRevisionId).toBe(state.revisions[state.revisions.length - 1]?.id);
  });

  it('does not mutate the payload when under the limit', () => {
    useRevisionStore.getState().enableRevisionMode('base');
    useRevisionStore.getState().addRevision('base', 'next', [hunk('next')]);
    expect(useRevisionStore.getState().revisions).toHaveLength(1);
    expect(useRevisionStore.getState().revisions[0].oldSource).toBe('base');
  });
});
