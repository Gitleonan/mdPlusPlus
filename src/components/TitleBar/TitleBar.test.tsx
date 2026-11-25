import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useTabsStore } from '../../stores/tabsStore';
import { TitleBar } from './TitleBar';
import { openContainingFolder } from '../../ipc/opener';

vi.mock('../../hooks/useOpenFile', () => ({
  openViaDialog: vi.fn(),
}));

vi.mock('../../ipc/opener', () => ({
  openLocalPath: vi.fn().mockResolvedValue(undefined),
  openContainingFolder: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.mocked(openContainingFolder).mockClear();
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
});

describe('TitleBar tab context menu', () => {
  it('reveals the tab file in Explorer from the open containing location action', async () => {
    render(
      <TitleBar
        onExport={vi.fn()}
        onAbout={vi.fn()}
        onThemeManager={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByText('note.md'));
    fireEvent.click(await screen.findByRole('menuitem', { name: '打开所在位置' }));

    await waitFor(() => {
      expect(openContainingFolder).toHaveBeenCalledWith('C:\\docs\\note.md');
    });
  });
});
