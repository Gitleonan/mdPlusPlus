import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUnsavedCloseGuard } from './useUnsavedCloseGuard';
import { useEditStore } from '../stores/editStore';
import { useTabsStore } from '../stores/tabsStore';
import {
  resetDiscardConfirmForTests,
  useDiscardConfirmStore,
} from '../stores/discardConfirmStore';
import { useToastStore } from '../stores/toastStore';

const closeHandler = vi.fn();
const destroy = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: vi.fn(async (handler) => {
      closeHandler.mockImplementation(handler);
      return vi.fn();
    }),
    destroy,
  }),
}));

describe('useUnsavedCloseGuard', () => {
  beforeEach(() => {
    resetDiscardConfirmForTests();
    closeHandler.mockReset();
    destroy.mockClear();
    destroy.mockResolvedValue(undefined);
    useToastStore.setState({ toasts: [] });
    useTabsStore.setState({
      tabs: [{
        id: 'tab-1',
        filePath: 'C:\\docs\\note.md',
        fileName: 'note.md',
        source: '# Note',
        html: '<h1>Note</h1>',
        highlightComplete: true,
        toc: [],
        tocExpanded: {},
        isLoading: false,
      }],
      activeTabId: 'tab-1',
    });
    useEditStore.setState({ isEditing: true, isDirty: true, lastSaveAt: 0 });
  });

  it('prevents closing and keeps the draft when cancellation is chosen', async () => {
    renderHook(() => useUnsavedCloseGuard());
    const event = { preventDefault: vi.fn() };

    const closing = closeHandler(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(useDiscardConfirmStore.getState().request?.message).toContain('note.md');
    useDiscardConfirmStore.getState().resolve(false);
    await closing;

    expect(destroy).not.toHaveBeenCalled();
    expect(useEditStore.getState().isDirty).toBe(true);
  });

  it('destroys the window after the draft is explicitly discarded', async () => {
    renderHook(() => useUnsavedCloseGuard());
    const event = { preventDefault: vi.fn() };

    const closing = closeHandler(event);
    useDiscardConfirmStore.getState().resolve(true);
    await act(async () => { await closing; });

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(useEditStore.getState().isDirty).toBe(false);
  });

  it('keeps the draft dirty when window destruction fails', async () => {
    destroy.mockRejectedValueOnce(new Error('ACL denied'));
    renderHook(() => useUnsavedCloseGuard());
    const event = { preventDefault: vi.fn() };

    const closing = closeHandler(event);
    useDiscardConfirmStore.getState().resolve(true);
    await act(async () => { await closing; });

    expect(useEditStore.getState().isDirty).toBe(true);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('allows closing immediately when there is no unsaved edit', async () => {
    useEditStore.setState({ isDirty: false });
    renderHook(() => useUnsavedCloseGuard());
    const event = { preventDefault: vi.fn() };

    await closeHandler(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });
});
