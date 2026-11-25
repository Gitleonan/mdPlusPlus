import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useTabsStore } from '../../stores/tabsStore';
import { useEditStore } from '../../stores/editStore';
import {
  resetDiscardConfirmForTests,
  useDiscardConfirmStore,
} from '../../stores/discardConfirmStore';
import { readFile } from '../../ipc/files';
import { Editor } from './Editor';

vi.mock('../../ipc/files', () => ({
  readFile: vi.fn(),
  watchFiles: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue('# refreshed'),
}));

describe('Editor', () => {
  let innerHTMLDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useRealTimers();
    vi.mocked(invoke).mockResolvedValue('# refreshed');
    vi.mocked(readFile).mockResolvedValue('# refreshed');
    resetDiscardConfirmForTests();
    useEditStore.setState({ isEditing: false, isDirty: false, lastSaveAt: 0 });
    useTabsStore.setState({
      activeTabId: 'tab-1',
      tabs: [{
        id: 'tab-1',
        filePath: 'C:\\doc.md',
        fileName: 'doc.md',
        source: Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join('\n'),
        html: '<p>doc</p>',
        highlightComplete: true,
        toc: [],
        tocExpanded: {},
        isLoading: false,
      }],
    });
  });

  afterEach(() => {
    if (innerHTMLDescriptor) {
      Object.defineProperty(Element.prototype, 'innerHTML', innerHTMLDescriptor);
      innerHTMLDescriptor = undefined;
    }
    vi.useRealTimers();
  });

  it('starts at the preview scroll position when entering edit mode', () => {
    useTabsStore.getState().setScrollTop('tab-1', 320);
    const { container } = render(<Editor />);
    const textarea = container.querySelector<HTMLTextAreaElement>('.editor-textarea');

    expect(textarea?.scrollTop).toBe(320);
  });

  it('does not rebuild the whole highlight layer with innerHTML while typing', () => {
    vi.useFakeTimers();
    const source = Array.from({ length: 5_000 }, (_, i) => `line ${i + 1}`).join('\n');
    useTabsStore.setState({
      activeTabId: 'tab-1',
      tabs: [{
        id: 'tab-1',
        filePath: 'C:\\large.md',
        fileName: 'large.md',
        source,
        html: '<p>large</p>',
        highlightComplete: true,
        toc: [],
        tocExpanded: {},
        isLoading: false,
      }],
    });

    innerHTMLDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    const innerHTMLWrites = vi.fn();
    Object.defineProperty(Element.prototype, 'innerHTML', {
      configurable: true,
      get() {
        return innerHTMLDescriptor?.get?.call(this);
      },
      set(value) {
        if (this instanceof HTMLPreElement) {
          innerHTMLWrites(value);
        }
        innerHTMLDescriptor?.set?.call(this, value);
      },
    });

    const { container } = render(<Editor />);
    const textarea = container.querySelector<HTMLTextAreaElement>('.editor-textarea');
    expect(textarea).not.toBeNull();
    const writesAfterInitialRender = innerHTMLWrites.mock.calls.length;

    fireEvent.change(textarea!, { target: { value: `${source}\n# new heading` } });
    vi.advanceTimersByTime(200);

    expect(innerHTMLWrites).toHaveBeenCalledTimes(writesAfterInitialRender);
  });

  it('syncs the textarea when an external refresh lands while the draft is not dirty', () => {
    const { container } = render(<Editor />);
    const textarea = container.querySelector<HTMLTextAreaElement>('.editor-textarea')!;
    expect(textarea.value).toContain('line 1');

    act(() => {
      useTabsStore.getState().updateSource('tab-1', '# refreshed', {
        html: '<h1>refreshed</h1>',
        toc: [],
      });
    });

    expect(textarea.value).toBe('# refreshed');
  });

  it('does not overwrite a dirty draft when the store changes underneath it', () => {
    const { container } = render(<Editor />);
    const textarea = container.querySelector<HTMLTextAreaElement>('.editor-textarea')!;
    fireEvent.change(textarea, {
      target: {
        value: '# local draft',
        selectionStart: '# local draft'.length,
        selectionEnd: '# local draft'.length,
      },
    });
    expect(useEditStore.getState().isDirty).toBe(true);

    act(() => {
      useTabsStore.getState().updateSource('tab-1', '# external update', {
        html: '<h1>external</h1>',
        toc: [],
      });
    });

    expect(textarea.value).toBe('# local draft');
  });

  it('shows the refreshed disk content after the user confirms discarding a draft', async () => {
    const { container } = render(<Editor />);
    const textarea = container.querySelector<HTMLTextAreaElement>('.editor-textarea')!;
    fireEvent.change(textarea, {
      target: {
        value: '# local draft',
        selectionStart: '# local draft'.length,
        selectionEnd: '# local draft'.length,
      },
    });
    useEditStore.setState({ isEditing: true, isDirty: true });

    const reload = useTabsStore.getState().reloadTab('tab-1');
    expect(useDiscardConfirmStore.getState().request).not.toBeNull();
    act(() => useDiscardConfirmStore.getState().resolve(true));
    await act(async () => { await reload; });

    expect(textarea.value).toBe('# refreshed');
    expect(useEditStore.getState().isDirty).toBe(false);
  });
});
