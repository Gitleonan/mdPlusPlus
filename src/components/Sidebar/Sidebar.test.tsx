import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { buildTocTree, filterTocTree, splitHighlightedText, Sidebar } from '../Sidebar/Sidebar';
import { describe, it, expect, vi } from 'vitest';

const sampleToc = [
  { id: 'doc-title', level: 1 as const, text: 'Claude Code 配置交接单' },
  { id: 'sec-0', level: 2 as const, text: '0. 交接什么' },
  { id: 'sec-1', level: 2 as const, text: '1. 复制 skills' },
  { id: 'sec-2', level: 3 as const, text: '子章节详情' },
];

describe('buildTocTree', () => {
  it('nests children by level', () => {
    const flat = [
      { id: 'a', level: 1 as const, text: 'A' },
      { id: 'b', level: 2 as const, text: 'B' },
      { id: 'c', level: 2 as const, text: 'C' },
      { id: 'd', level: 3 as const, text: 'D' },
    ];
    const tree = buildTocTree(flat);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children![1].children).toHaveLength(1);
  });

  it('returns empty for empty input', () => {
    expect(buildTocTree([])).toEqual([]);
  });

  it('handles same level items', () => {
    const flat = [
      { id: 'a', level: 1 as const, text: 'A' },
      { id: 'b', level: 1 as const, text: 'B' },
    ];
    const tree = buildTocTree(flat);
    expect(tree).toHaveLength(2);
  });

  it('filters nodes and keeps matching descendants', () => {
    const tree = buildTocTree([
      { id: 'a', level: 1 as const, text: 'Intro' },
      { id: 'b', level: 2 as const, text: 'Install Windows' },
      { id: 'c', level: 1 as const, text: 'API' },
    ]);

    const filtered = filterTocTree(tree, 'windows');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].text).toBe('Intro');
    expect(filtered[0].children?.[0].text).toBe('Install Windows');
  });

  it('splits matched TOC text case-insensitively', () => {
    expect(splitHighlightedText('Install Windows', 'win')).toEqual([
      { text: 'Install ', match: false },
      { text: 'Win', match: true },
      { text: 'dows', match: false },
    ]);
  });
});

describe('Sidebar collapsed anchor rail & hover popover', () => {
  it('renders anchor bars when collapsed and marks active chapter', () => {
    render(<Sidebar toc={sampleToc} activeId="sec-0" />);

    fireEvent.click(screen.getByRole('button', { name: '收起目录' }));

    const rail = screen.getByRole('navigation', { name: '章节锚点导航条' });
    const railItems = rail.querySelectorAll('.toc-rail-item');
    expect(railItems).toHaveLength(sampleToc.length);

    const activeBarBtn = screen.getByRole('button', { name: '跳转到章节：0. 交接什么' });
    expect(activeBarBtn).toHaveAttribute('aria-current', 'true');
    expect(activeBarBtn.querySelector('.toc-rail-bar-active')).not.toBeNull();
  });

  it('opens floating TOC popover on hover and jumps to heading on click', async () => {
    const onSelectHeading = vi.fn();

    const heading = document.createElement('h2');
    heading.id = 'sec-1';
    heading.textContent = '1. 复制 skills';
    document.body.appendChild(heading);

    try {
      render(<Sidebar toc={sampleToc} activeId="sec-0" onSelectHeading={onSelectHeading} />);
      fireEvent.click(screen.getByRole('button', { name: '收起目录' }));

      const rail = screen.getByRole('navigation', { name: '章节锚点导航条' });
      fireEvent.mouseEnter(rail);

      const popover = await screen.findByRole('navigation', { name: '章节目录快捷导航' });
      expect(popover).toBeInTheDocument();
      expect(within(popover).getByText('Claude Code 配置交接单')).toBeInTheDocument();
      expect(within(popover).getByText('0. 交接什么')).toBeInTheDocument();
      expect(within(popover).getByText('1. 复制 skills')).toBeInTheDocument();

      fireEvent.click(within(popover).getByRole('button', { name: '1. 复制 skills' }));

      expect(onSelectHeading).toHaveBeenCalledWith('sec-1');
      await waitFor(() => {
        expect(heading.classList.contains('heading-jump-highlight')).toBe(true);
      });
    } finally {
      heading.remove();
    }
  });
});
