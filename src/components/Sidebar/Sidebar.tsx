import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react';
import { flashHeadingAnchor, smoothScrollToElement } from '../../utils/smoothScroll';
import type { TocItem } from '../../types';

export interface TocNode extends TocItem {
  children?: TocNode[];
}

/** 将扁平 TOC 列表转换为嵌套树 */
export function buildTocTree(flat: TocItem[]): TocNode[] {
  const root: TocNode[] = [];
  const stack: TocNode[] = [];
  for (const item of flat) {
    const node: TocNode = { ...item };
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    if (stack.length === 0) {
      root.push(node);
    } else {
      const parent = stack[stack.length - 1];
      parent.children = parent.children || [];
      parent.children.push(node);
    }
    stack.push(node);
  }
  return root;
}

export function splitHighlightedText(text: string, keyword: string): Array<{ text: string; match: boolean }> {
  if (!keyword) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const needle = keyword.toLowerCase();
  const parts: Array<{ text: string; match: boolean }> = [];
  let start = 0;
  let index = lower.indexOf(needle);

  while (index !== -1) {
    if (index > start) parts.push({ text: text.slice(start, index), match: false });
    parts.push({ text: text.slice(index, index + keyword.length), match: true });
    start = index + keyword.length;
    index = lower.indexOf(needle, start);
  }

  if (start < text.length) parts.push({ text: text.slice(start), match: false });
  return parts;
}

export function filterTocTree(nodes: TocNode[], keyword: string): TocNode[] {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return nodes;

  return nodes.flatMap((node) => {
    const children = node.children ? filterTocTree(node.children, keyword) : [];
    const selfMatches = node.text.toLowerCase().includes(needle);
    if (!selfMatches && children.length === 0) return [];
    return [{ ...node, children }];
  });
}

const SPRING_SNAPPY = { type: 'spring' as const, stiffness: 480, damping: 34, mass: 0.78 };

interface PopoverPosition {
  top: number;
  left: number;
  maxHeight: number;
}

export interface SidebarProps {
  toc: TocItem[];
  activeId?: string | null;
  onSelectHeading?: (id: string) => void;
}

export function Sidebar({ toc, activeId, onSelectHeading }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [jumpingId, setJumpingId] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<PopoverPosition>({ top: 56, left: 10, maxHeight: 460 });

  const railRef = useRef<HTMLDivElement>(null);
  const popoverListRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const jumpTimerRef = useRef<number | null>(null);

  const tree = useMemo(() => buildTocTree(toc), [toc]);
  const visibleTree = useMemo(() => filterTocTree(tree, query), [tree, query]);

  const minLevel = useMemo(
    () => (toc.length ? Math.min(...toc.map((item) => item.level)) : 1),
    [toc],
  );

  // 有效激活 ID：若尚无 activeId，默认指向首章（方便横条与弹层始终有清晰当前锚点）
  const effectiveActiveId = activeId ?? toc[0]?.id ?? null;

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const updatePopoverPosition = useCallback(() => {
    const rail = railRef.current;
    const viewportH = window.innerHeight || 720;
    if (!rail) {
      setPopoverPos({ top: 56, left: 10, maxHeight: Math.max(220, viewportH - 80) });
      return;
    }
    const rect = rail.getBoundingClientRect();
    const top = Math.max(50, Math.min(rect.top - 8, viewportH - 220));
    const left = Math.max(8, rect.left + 4);
    const maxHeight = Math.max(180, Math.min(420, viewportH - top - 20));
    setPopoverPos({ top, left, maxHeight });
  }, []);

  const openPopover = useCallback((initialHoverId?: string) => {
    clearCloseTimer();
    updatePopoverPosition();
    if (initialHoverId) setHoveredId(initialHoverId);
    setPopoverOpen(true);
  }, [clearCloseTimer, updatePopoverPosition]);

  const scheduleClosePopover = useCallback((delay = 160) => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setPopoverOpen(false);
      setHoveredId(null);
      closeTimerRef.current = null;
    }, delay);
  }, [clearCloseTimer]);

  // 清理定时器
  useEffect(() => () => {
    clearCloseTimer();
    if (jumpTimerRef.current != null) window.clearTimeout(jumpTimerRef.current);
  }, [clearCloseTimer]);

  // 展开侧边栏或 ESC 时关闭悬浮弹层
  useEffect(() => {
    if (!collapsed && popoverOpen) {
      clearCloseTimer();
      setPopoverOpen(false);
    }
  }, [collapsed, popoverOpen, clearCloseTimer]);

  useEffect(() => {
    if (!popoverOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearCloseTimer();
        setPopoverOpen(false);
        setHoveredId(null);
      }
    };
    const onResize = () => updatePopoverPosition();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [popoverOpen, clearCloseTimer, updatePopoverPosition]);

  // 打开弹层时将当前激活章节滚入可视区
  useEffect(() => {
    if (!popoverOpen || !effectiveActiveId) return;
    const frame = requestAnimationFrame(() => {
      const list = popoverListRef.current;
      if (!list) return;
      const activeEl = list.querySelector<HTMLElement>('[data-toc-active="true"]');
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [popoverOpen, effectiveActiveId]);

  // 收起态下当前章节变化时，确保对应横条在轨道可视区内
  useEffect(() => {
    if (!collapsed || !effectiveActiveId) return;
    const rail = railRef.current;
    if (!rail) return;
    const activeBar = rail.querySelector<HTMLElement>('[data-rail-active="true"]');
    if (activeBar && typeof activeBar.scrollIntoView === 'function') {
      activeBar.scrollIntoView({ block: 'nearest' });
    }
  }, [collapsed, effectiveActiveId]);

  const jumpToHeading = useCallback((id: string, closePopoverAfter = false) => {
    onSelectHeading?.(id);
    setJumpingId(id);
    if (jumpTimerRef.current != null) window.clearTimeout(jumpTimerRef.current);
    jumpTimerRef.current = window.setTimeout(() => {
      setJumpingId(null);
      jumpTimerRef.current = null;
    }, 360);

    const el = document.getElementById(id);
    if (el) {
      smoothScrollToElement(el, null, 'start');
      flashHeadingAnchor(el);
    }

    if (closePopoverAfter) {
      // 给用户 120ms 看见激活蓝条弹跳到目标项，再柔和收起弹层
      scheduleClosePopover(120);
    }
  }, [onSelectHeading, scheduleClosePopover]);

  if (!tree.length) return null;

  const getRailBarMetrics = (level: number, isActive: boolean) => {
    const depth = Math.max(0, level - minLevel);
    if (isActive) {
      return { width: 22, height: 4, isPrimary: false };
    }
    if (depth === 0) return { width: 16, height: 2.5, isPrimary: true };
    if (depth === 1) return { width: 15, height: 2.5, isPrimary: false };
    if (depth === 2) return { width: 11, height: 2.5, isPrimary: false };
    return { width: 8, height: 2.5, isPrimary: false };
  };

  const renderNodes = (nodes: TocNode[]) => (
    <ul className="toc-list">
      {nodes.map((n) => {
        const isActive = effectiveActiveId === n.id;
        const depth = Math.max(0, n.level - minLevel);
        return (
          <li key={n.id} className="toc-item">
            <a
              href={`#${n.id}`}
              className={`toc-link toc-level-${Math.min(depth, 3)} ${isActive ? 'toc-link-active' : ''}`}
              style={{ paddingLeft: 14 + (n.level - 1) * 14 }}
              aria-current={isActive ? 'true' : undefined}
              onClick={(e) => {
                e.preventDefault();
                jumpToHeading(n.id, false);
              }}
            >
              <span className="toc-link-text">
                {splitHighlightedText(n.text, query.trim()).map((part, index) => (
                  part.match
                    ? <mark key={`${part.text}-${index}`} className="toc-match">{part.text}</mark>
                    : <span key={`${part.text}-${index}`}>{part.text}</span>
                ))}
              </span>
            </a>
            {n.children && renderNodes(n.children)}
          </li>
        );
      })}
    </ul>
  );

  const popoverPortal = typeof document !== 'undefined'
    ? createPortal(
      <AnimatePresence>
        {collapsed && popoverOpen && (
          <motion.div
            key="toc-floating-popover"
            className="toc-popover"
            role="navigation"
            aria-label="章节目录快捷导航"
            style={{
              top: popoverPos.top,
              left: popoverPos.left,
              maxHeight: popoverPos.maxHeight,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            onMouseEnter={clearCloseTimer}
            onMouseLeave={() => scheduleClosePopover(140)}
          >
            <div className="toc-popover-list" ref={popoverListRef}>
              {toc.map((item) => {
                const isActive = effectiveActiveId === item.id;
                const isHovered = hoveredId === item.id;
                const isJumping = jumpingId === item.id;
                const depth = Math.max(0, item.level - minLevel);
                const isTopLevel = depth === 0;
                // 保持 H1 与 H2 左对齐（贴合附件2视觉），H3 及以下轻微缩进体现层级
                const extraIndent = depth >= 2 ? (depth - 1) * 10 : 0;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`toc-popover-item ${isActive ? 'toc-popover-item-active' : ''} ${isTopLevel ? 'toc-popover-item-primary' : ''}`}
                    data-toc-active={isActive ? 'true' : undefined}
                    aria-current={isActive ? 'true' : undefined}
                    style={{ paddingLeft: 9 + extraIndent }}
                    onMouseEnter={() => setHoveredId(item.id)}
                    onClick={() => jumpToHeading(item.id, true)}
                  >
                    {isHovered && (
                      <motion.span
                        layoutId="toc-popover-hover-pill"
                        className="toc-popover-hover-pill"
                        transition={SPRING_SNAPPY}
                      />
                    )}
                    <span className="toc-popover-dash-wrap" aria-hidden="true">
                      <span
                        className={`toc-popover-dash ${
                          isActive
                            ? 'toc-popover-dash-active'
                            : isTopLevel
                              ? 'toc-popover-dash-primary'
                              : ''
                        }`}
                        style={{
                          width: isActive ? 14 : isHovered ? 12 : isTopLevel ? 11 : 10,
                          height: isActive ? 3 : 2,
                          transform: isJumping ? 'scaleX(1.18)' : undefined,
                        }}
                      />
                    </span>
                    <span className="toc-popover-text">{item.text}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
    )
    : null;

  return (
    <>
      <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="sidebar-header">
          {!collapsed && (
            <div className="sidebar-title-group">
              <span className="sidebar-title">目录</span>
              <span className="sidebar-count">{toc.length}</span>
            </div>
          )}
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? '展开目录' : '收起目录'}
            aria-label={collapsed ? '展开目录' : '收起目录'}
          >
            {collapsed
              ? <PanelLeftOpen className="sidebar-toggle-icon" size={14} strokeWidth={1.6} />
              : <PanelLeftClose className="sidebar-toggle-icon" size={14} strokeWidth={1.6} />
            }
          </button>
        </div>

        {!collapsed ? (
          <div className="sidebar-expanded-body">
            <div className="toc-search">
              <div className="toc-search-input-wrap">
                <Search className="toc-search-icon" size={12} strokeWidth={1.8} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="toc-search-input"
                  placeholder="搜索目录"
                />
                {query && (
                  <button
                    type="button"
                    className="toc-search-clear"
                    onClick={() => setQuery('')}
                    title="清空目录搜索"
                    aria-label="清空目录搜索"
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
            <div className="toc-scroll-area">
              {visibleTree.length > 0 ? (
                renderNodes(visibleTree)
              ) : (
                <div className="toc-empty">没有匹配的标题</div>
              )}
            </div>
          </div>
        ) : (
          <div
            ref={railRef}
            className="toc-rail"
            role="navigation"
            aria-label="章节锚点导航条"
            onMouseEnter={() => openPopover()}
            onMouseLeave={() => scheduleClosePopover(180)}
          >
            {toc.map((item) => {
              const isActive = effectiveActiveId === item.id;
              const { width, height, isPrimary } = getRailBarMetrics(item.level, isActive);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`toc-rail-item ${isActive ? 'toc-rail-item-active' : ''}`}
                  data-rail-active={isActive ? 'true' : undefined}
                  aria-label={`跳转到章节：${item.text}`}
                  aria-current={isActive ? 'true' : undefined}
                  onMouseEnter={() => openPopover(item.id)}
                  onFocus={() => openPopover(item.id)}
                  onClick={() => jumpToHeading(item.id, true)}
                >
                  <span
                    className={`toc-rail-bar ${
                      isActive
                        ? 'toc-rail-bar-active'
                        : isPrimary
                          ? 'toc-rail-bar-primary'
                          : ''
                    }`}
                    style={{ width, height }}
                  />
                </button>
              );
            })}
          </div>
        )}
      </aside>
      {popoverPortal}
    </>
  );
}
