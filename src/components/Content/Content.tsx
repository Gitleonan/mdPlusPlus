import { useEffect, useRef, useState, useCallback } from 'react';
import { AlignCenter, ChevronUp, Maximize2, X } from 'lucide-react';
import { useTabsStore } from '../../stores/tabsStore';
import { useZenStore } from '../../stores/zenStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { countChangeSegments, useRevisionStore } from '../../stores/revisionStore';
import { resolveImages } from '../../ipc/files';
import { openExternalUrl, openLocalPath } from '../../ipc/opener';
import { renderMermaidInContainer } from '../../features/markdown/mermaid';
import { injectAnchors } from '../../features/markdown/anchors';
import { classifyLink, resolveLocalPath } from '../../features/markdown/links';
import { useLightbox } from '../../hooks/useLightbox';
import { smoothScrollTo } from '../../utils/smoothScroll';
import { segmentHunks, groupChangeSegments } from '../../utils/diff';
import { renderMarkdown } from '../../features/markdown/render';
import { highlightCodeBlocks } from '../../features/markdown/highlight';
import { extractToc } from '../../features/markdown/toc';
import { enhanceTables } from '../../features/markdown/table-resize';
import { setupTabs } from '../../features/markdown/tabs';
import type { RevisionHunk } from '../../types';

interface ContentProps {
  contentRef?: React.RefObject<HTMLDivElement>;
  onActiveHeadingChange?: (id: string | null) => void;
}

export function countMarkdownWords(source: string): number {
  const cleaned = source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_\-[\]()`|~]/g, ' ');
  const cjkChars = cleaned.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const latinWords = cleaned
    .replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, ' ')
    .match(/[A-Za-z0-9]+(?:[+'-][A-Za-z0-9]+)*/g)?.length ?? 0;
  return cjkChars + latinWords;
}

const wordCountCache = new Map<string, number>();

/** 字数统计会逐字扫全文；同一份源码在滚动/重绘期间不应反复计算。 */
export function getMarkdownWordCount(source: string): number {
  const cached = wordCountCache.get(source);
  if (cached !== undefined) return cached;
  const count = countMarkdownWords(source);
  if (wordCountCache.size >= 8) wordCountCache.clear();
  wordCountCache.set(source, count);
  return count;
}

export function getActiveHeadingId(container: HTMLElement, topOffset = 96): string | null {
  const headings = Array.from(
    container.querySelectorAll<HTMLElement>('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]'),
  );
  if (!headings.length) return null;

  const threshold = container.scrollTop + topOffset;
  let active = headings[0].id;
  for (const heading of headings) {
    if (heading.offsetTop > threshold) break;
    active = heading.id;
  }
  return active;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, [contenteditable="true"]'));
}

function selectElementContents(element: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

function handlePreviewSelectAll(e: React.KeyboardEvent<HTMLElement>): void {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return;
  if (isEditableTarget(e.target)) return;

  e.preventDefault();
  selectElementContents(e.currentTarget);
}

/** 给已注入的预览 DOM 挂上图片灯箱和链接拦截，返回清理函数。 */
function attachPreviewInteractions(container: HTMLElement, filePath: string): () => void {
  const open = useLightbox.getState().open;
  const imgCleanups: Array<() => void> = [];
  container.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    if (img.closest('a')) return;
    const onClick = () => open(img.src);
    img.addEventListener('click', onClick);
    imgCleanups.push(() => img.removeEventListener('click', onClick));
  });

  const onLinkClick = (e: MouseEvent) => {
    const target = e.target instanceof Element
      ? e.target
      : e.target instanceof Node
        ? e.target.parentElement
        : null;
    const a = target?.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    const link = classifyLink(href);
    if (link.kind === 'anchor') return;
    e.preventDefault();
    if (link.kind === 'external') {
      openExternalUrl(link.url).catch((err) => console.error('[link] openUrl failed', err));
      return;
    }
    if (link.kind === 'mdFile') {
      const resolved = resolveLocalPath(filePath, link.path);
      useTabsStore
        .getState()
        .openTab(resolved)
        .catch((err) => console.error('[link] openTab failed', err));
      return;
    }
    if (link.kind === 'localFile') {
      const resolved = resolveLocalPath(filePath, link.path);
      openLocalPath(resolved).catch((err) => console.error('[link] openPath failed', err));
    }
  };
  container.addEventListener('click', onLinkClick);

  return () => {
    container.removeEventListener('click', onLinkClick);
    imgCleanups.forEach((fn) => fn());
  };
}

/** 为代码块添加复制按钮、语言标签和行号 */
function enhanceCodeBlocks(container: HTMLElement) {
  // 处理两种情况：
  // 1. 已被 code-features.ts 包装的 .code-block-wrapper（带标题的代码块）
  // 2. 未被包装的裸 <pre> 元素
  const wrappers = container.querySelectorAll('.code-block-wrapper');
  wrappers.forEach((wrapper) => {
    if (wrapper.querySelector('.code-block-copy')) return; // 已处理
    const pre = wrapper.querySelector('pre');
    if (!pre) return;
    const code = pre.querySelector('code');
    const langClass = code?.className || '';
    const langMatch = langClass.match(/language-(\w+)/);
    const lang = langMatch?.[1] || '';

    if (lang && !wrapper.querySelector('.code-block-lang')) {
      const langLabel = document.createElement('span');
      langLabel.className = 'code-block-lang';
      langLabel.textContent = lang;
      wrapper.appendChild(langLabel);
    }

    addCopyButton(wrapper, code);
    injectLineNumbers(wrapper, pre);
  });

  // 处理未被包装的裸 <pre>
  const pres = container.querySelectorAll('pre');
  pres.forEach((pre) => {
    if (pre.parentElement?.classList.contains('code-block-wrapper')) return;

    const code = pre.querySelector('code');
    const langClass = code?.className || '';
    const langMatch = langClass.match(/language-(\w+)/);
    const lang = langMatch?.[1] || '';

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';
    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    if (lang) {
      const langLabel = document.createElement('span');
      langLabel.className = 'code-block-lang';
      langLabel.textContent = lang;
      wrapper.appendChild(langLabel);
    }

    addCopyButton(wrapper, code);
    injectLineNumbers(wrapper, pre);
  });
}

/** 通过 DOM 操作注入行号（比正则可靠） */
function injectLineNumbers(wrapper: Element, pre: Element) {
  if (wrapper.querySelector('.line-numbers')) return;
  const lineCount = getCodeLineCount(pre);
  if (lineCount < 2) return;

  wrapper.classList.add('line-numbers-mode');
  const gutter = document.createElement('div');
  gutter.className = 'line-numbers';
  for (let i = 1; i <= lineCount; i++) {
    const span = document.createElement('span');
    span.className = 'line-number';
    span.textContent = String(i);
    gutter.appendChild(span);
  }
  wrapper.insertBefore(gutter, pre);
}

function getCodeLineCount(pre: Element): number {
  const renderedLineCount = pre.querySelectorAll('.line').length;
  const codeText = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
  const textLineCount = codeText.length ? codeText.split(/\r\n|\r|\n/).length : 0;

  return Math.max(renderedLineCount, textLineCount);
}

function addCopyButton(wrapper: Element, code: HTMLElement | null) {
  const copyBtn = document.createElement('button');
  copyBtn.className = 'code-block-copy';
  copyBtn.textContent = '复制';
  copyBtn.addEventListener('click', async () => {
    const text = code?.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = '已复制';
      copyBtn.classList.add('copied');
      setTimeout(() => {
        copyBtn.textContent = '复制';
        copyBtn.classList.remove('copied');
      }, 2000);
    } catch {
      copyBtn.textContent = '失败';
      setTimeout(() => { copyBtn.textContent = '复制'; }, 2000);
    }
  });
  wrapper.appendChild(copyBtn);
}

function ZenHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 下一帧触发入场动画
    const show = requestAnimationFrame(() => setVisible(true));
    const hide = setTimeout(() => setVisible(false), 2000);
    return () => {
      cancelAnimationFrame(show);
      clearTimeout(hide);
    };
  }, []);

  return (
    <div className={`zen-hint ${visible ? 'zen-hint-show' : ''}`}>
      按 ESC 退出专注模式
    </div>
  );
}


/** 修订模式预览视图：分组渲染，新增内容红色字体，删除内容带删除线 */
function RevisionPreview({
  newSource,
  oldSource,
  filePath,
  hunks,
}: {
  newSource: string;
  oldSource: string;
  filePath: string;
  hunks: RevisionHunk[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const currentSegmentIndex = useRevisionStore((s) => s.currentSegmentIndex);
  const currentRevisionId = useRevisionStore((s) => s.currentRevisionId);
  useEffect(() => {
    let cancelled = false;
    const theme =
      document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    (async () => {
      try {
        const segments = segmentHunks(hunks);
        const changeGroups = groupChangeSegments(segments);
        // 将每个段落渲染为 HTML；变更块外层带 id 锚点 + data-rev-seg
        const parts: string[] = [];
        segments.forEach((seg, segIdx) => {
          if (seg.kind === 'unchanged') {
            parts.push(renderMarkdown(seg.source));
            return;
          }
          // 该段属于第几个变更点
          const groupIdx = changeGroups.findIndex(g => g.includes(segIdx));
          const blockId = groupIdx >= 0 ? `rev-seg-${groupIdx}` : '';
          const idAttr = blockId ? ` id="${blockId}" data-rev-seg="${groupIdx}"` : '';
          const cls = seg.kind === 'added' ? 'rev-add' : 'rev-del';
          parts.push(
            `<div class="rev-block ${cls}"${idAttr}>${renderMarkdown(seg.source)}</div>`,
          );
        });
        const rendered = parts.join('\n');
        // 先展示安全渲染结果；Shiki 只负责代码块着色，不阻塞正文。
        if (!cancelled) setHtml(rendered);
        void highlightCodeBlocks(rendered, theme)
          .then((highlighted) => {
            if (!cancelled) setHtml(highlighted);
          })
          .catch(console.error);
      } catch (err) {
        console.error('[RevisionPreview] render failed', err);
        if (!cancelled) setHtml(`<p>渲染失败</p>`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [newSource, oldSource, hunks]);

  // DOM 注入与增强只在文档内容变化时执行
  useEffect(() => {
    if (!html || !containerRef.current) return;
    const el = containerRef.current;
    el.innerHTML = html;

    // 注入锚点（用新版本 TOC）
    const toc = extractToc(newSource);
    injectAnchors(el, toc);

    // 增强代码块
    enhanceCodeBlocks(el);

    // 表格列宽拖拽（修订预览按文件记忆）
    enhanceTables(el, `rev:${filePath}`);

    // ::: tabs 标签页
    setupTabs(el);

    // 图片和 Mermaid
    Promise.all([
      resolveImages(el, filePath),
      renderMermaidInContainer(el),
    ]).catch(console.error);

    // 导航只改变 currentSegmentIndex，不应因父组件的新回调而重建正文。
    return attachPreviewInteractions(el, filePath);
  }, [html, filePath, newSource, hunks]);

  // 导航只滚动，不重建 DOM / 图片 / Mermaid
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !currentRevisionId) return;
    const target = el.querySelector(`#rev-seg-${currentSegmentIndex}`);
    if (!target) return;
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [currentSegmentIndex, currentRevisionId, html]);

  if (!html) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p className="loading-text">正在渲染修订预览…</p>
      </div>
    );
  }

  return (
    <main className="md-content rev-preview" ref={containerRef} tabIndex={-1} />
  );
}

/** 监听变更悬浮栏：光点状态 + 上一个/下一个导航 + 停止监听 */
function MonitoringIndicator() {
  const isRevisionMode = useRevisionStore((s) => s.isRevisionMode);
  const revisions = useRevisionStore((s) => s.revisions);
  const currentRevisionId = useRevisionStore((s) => s.currentRevisionId);
  const currentSegmentIndex = useRevisionStore((s) => s.currentSegmentIndex);
  const navigatePrev = useRevisionStore((s) => s.navigatePrev);
  const navigateNext = useRevisionStore((s) => s.navigateNext);
  const disableRevisionMode = useRevisionStore((s) => s.disableRevisionMode);

  const currentRevision = revisions.find((r) => r.id === currentRevisionId) ?? null;

  if (!isRevisionMode) return null;

  const revIndex = revisions.findIndex((r) => r.id === currentRevisionId);
  const segTotal = currentRevision ? countChangeSegments(currentRevision.hunks) : 0;
  // 是否处于可导航的最末/最前（跨 revision）
  const atFirst = revIndex <= 0 && currentSegmentIndex <= 0;
  const atLast = revIndex >= revisions.length - 1 && currentSegmentIndex >= segTotal - 1;

  const addedCount = currentRevision?.hunks.filter((h) => h.type === 'added').length ?? 0;
  const removedCount = currentRevision?.hunks.filter((h) => h.type === 'removed').length ?? 0;
  const hasChanges = segTotal > 0;

  return (
    <div className="monitoring-indicator">
      {/* 状态光点 */}
      <span className="monitoring-pill">
        <span className="monitoring-dot" />
      </span>

      {/* 变更统计 */}
      {hasChanges && (
        <span className="monitoring-stats">
          {addedCount > 0 && <span className="rev-summary-added">+{addedCount}</span>}
          <span className="monitoring-stats-sep" />
          {removedCount > 0 && <span className="rev-summary-removed">-{removedCount}</span>}
        </span>
      )}

      {hasChanges && <span className="monitoring-divider" />}

      {/* 上一个 */}
      <button
        type="button"
        className="monitoring-btn"
        disabled={atFirst}
        onClick={navigatePrev}
        title="上一个变更"
      >
        ← 上一个
      </button>

      {/* 计数：当前变更点 / 该 revision 变更点总数 */}
      {hasChanges && (
        <span className="monitoring-count">
          {currentSegmentIndex + 1}/{segTotal}
        </span>
      )}

      {/* 下一个 */}
      <button
        type="button"
        className="monitoring-btn"
        disabled={atLast}
        onClick={navigateNext}
        title="下一个变更"
      >
        下一个 →
      </button>

      {/* 停止监听 */}
      <button
        type="button"
        className="monitoring-btn monitoring-btn-danger"
        onClick={disableRevisionMode}
        title="停止监听"
        aria-label="停止监听"
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  );
}

export function Content({ contentRef, onActiveHeadingChange }: ContentProps) {
  // 只订阅会改变渲染结果的字段。滚动位置存放在 tab 外的 map，
  // setScrollTop 不再替换 tab，因此不会触发这里重跑 innerHTML。
  const tabId = useTabsStore((s) => s.activeTabId);
  const tabHtml = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.html);
  const tabSource = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.source);
  const tabIsLoading = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.isLoading ?? false);
  const setScrollTop = useTabsStore((s) => s.setScrollTop);
  const isZen = useZenStore((s) => s.isZen);
  const contentWidth = useLayoutStore((s) => s.contentWidth);
  const toggleContentWidth = useLayoutStore((s) => s.toggleContentWidth);

	// 修订模式状态
	const isRevisionMode = useRevisionStore(s => s.isRevisionMode);
	const currentRevision = useRevisionStore(s =>
		s.revisions.find(r => r.id === s.currentRevisionId) ?? null,
	);

  const internalRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const ref = contentRef || internalRef;
  const previousTabIdRef = useRef<string | null>(null);
  const previousHtmlRef = useRef<string | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const syncReadingProgress = useCallback((el: HTMLElement) => {
    const fill = progressFillRef.current;
    if (!fill) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 16) {
      fill.style.opacity = '0';
      fill.style.transform = 'scaleX(0)';
      return;
    }
    const ratio = Math.min(1, Math.max(0, el.scrollTop / maxScroll));
    fill.style.opacity = ratio > 0.005 ? '1' : '0';
    fill.style.transform = `scaleX(${ratio.toFixed(4)})`;
  }, []);

  const handleBackToTop = useCallback(() => {
    if (ref.current) smoothScrollTo(ref.current, 0);
  }, [ref]);

  useEffect(() => {
    if (!ref.current || !tabId || tabHtml == null) return;
    // 通过 getState 读取，避免把 tab 整体写进 deps 而被滚动期间的引用刷新带歪。
    const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return;
	    const el = ref.current;
	    el.innerHTML = tab.html;

	    // 恢复滚动位置时，短暂屏蔽 scroll 事件，防止 setScrollTop 覆盖刚恢复的值
	    // 延迟到 rAF 确保浏览器完成布局后再设置 scrollTop
    const previousTabId = previousTabIdRef.current;
    const sameTab = previousTabId === tabId;
    previousTabIdRef.current = tabId;
    const restoreScroll = !sameTab || previousHtmlRef.current !== tabHtml;
    previousHtmlRef.current = tabHtml;
    let restoring = restoreScroll;
    if (restoreScroll) {
      requestAnimationFrame(() => {
        el.scrollTop = useTabsStore.getState().getScrollTop(tab.id);
        setShowBackToTop(el.scrollTop > 300);
        syncReadingProgress(el);
        // 再延迟一帧清除 restoring，避免 scroll 事件覆盖
        requestAnimationFrame(() => { restoring = false; });
      });
    }

    // 注入锚点 ID
    injectAnchors(el, tab.toc);

    // 增强代码块（复制按钮 + 语言标签）
    enhanceCodeBlocks(el);

    // 表格列宽拖拽（按 tab 记忆）
    enhanceTables(el, tab.id);

    // ::: tabs 标签页
    setupTabs(el);

    let cancelled = false;

    // 解析图片和渲染 Mermaid
    Promise.all([
      resolveImages(el, tab.filePath),
      renderMermaidInContainer(el),
    ])
      .catch(console.error)
      .finally(() => {
        if (cancelled) return;
      });

    // 图片点击 Lightbox（跳过被链接包裹的图片，如 badge）+ md/本地链接拦截
    const detachInteractions = attachPreviewInteractions(el, tab.filePath);

    const syncActiveHeading = () => {
      onActiveHeadingChange?.(getActiveHeadingId(el));
    };

    // 滚动记忆和目录定位
    const onScroll = () => {
      if (!restoring) {
        setScrollTop(tab.id, el.scrollTop);
      }
      syncActiveHeading();
      syncReadingProgress(el);
      setShowBackToTop(el.scrollTop > 300);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    syncActiveHeading();
    syncReadingProgress(el);

    return () => {
      cancelled = true;
      el.removeEventListener('scroll', onScroll);
      detachInteractions();
    };
		}, [
		    tabId,
		    tabHtml,
		    tabIsLoading,
		    setScrollTop,
		    ref,
		    onActiveHeadingChange,
		    syncReadingProgress,
		    isRevisionMode, // 修复 Bug 3: 从修订模式切回预览时需重新填充 innerHTML
		    currentRevision?.id, // 修复 Bug 2: 拒绝修订后 currentRevision 变为 null 时重新填充
		  ]);

  if (!tabId || (tabHtml == null && !tabIsLoading)) return null;

  // 修订模式 + 有当前修订：渲染新版本的 HTML 预览（而非原始 diff 文本）
  if (isRevisionMode && currentRevision) {
    const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId);
    return (
      <div className="content-shell">
        <MonitoringIndicator />
        <RevisionPreview
          newSource={currentRevision.newSource}
          oldSource={currentRevision.oldSource}
          filePath={tab?.filePath ?? ''}
          hunks={currentRevision.hunks}
        />
        <div className="word-count-badge">字数 {getMarkdownWordCount(currentRevision.newSource)}</div>
        {isZen && <ZenHint />}
      </div>
    );
  }

  // 正常模式 / 修订模式无修订：保持原有结构，useEffect 正常填充 innerHTML
  return (
    <div className="content-shell">
      <MonitoringIndicator />
      {tabIsLoading ? (
        <div className="loading-container">
          <div className="loading-spinner" />
          <p className="loading-text">正在加载文件…</p>
        </div>
      ) : (
        <>
          <div className="reading-progress-track" aria-hidden="true">
            <div className="reading-progress-fill" ref={progressFillRef} />
          </div>
          <main
            className="md-content"
            ref={ref}
            tabIndex={-1}
            onMouseDown={() => ref.current?.focus({ preventScroll: true })}
            onKeyDown={handlePreviewSelectAll}
          />
          <div className="word-count-badge">字数 {getMarkdownWordCount(tabSource ?? '')}</div>
          {isZen && <ZenHint />}
          {showBackToTop && (
            <button
              className="back-to-top"
              onClick={handleBackToTop}
              title="回到顶部"
              aria-label="回到顶部"
            >
              <ChevronUp size={16} strokeWidth={1.6} />
            </button>
          )}
          <button
            className="content-width-toggle"
            onClick={toggleContentWidth}
            title={contentWidth === 'full' ? '内容居中显示' : '内容铺满显示'}
            aria-label={contentWidth === 'full' ? '内容居中显示' : '内容铺满显示'}
          >
            {contentWidth === 'full'
              ? <AlignCenter size={15} strokeWidth={1.6} />
              : <Maximize2 size={15} strokeWidth={1.6} />}
          </button>
        </>
      )}
    </div>
  );
}
