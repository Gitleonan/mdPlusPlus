import { smoothScrollToElement } from '../../utils/smoothScroll';

const MARK_CLASS = 'search-mark';
const MARK_CURRENT_CLASS = 'search-mark-current';

export interface SearchSession {
  matches: HTMLElement[];
  current: number;
}

/** 在 root 内所有文本节点中查找 keyword，包 <mark>，返回匹配总数 */
export function highlightMatches(root: HTMLElement, keyword: string): number {
  clearHighlights(root);
  if (!keyword) return 0;

  const kwLower = keyword.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (p.tagName === 'SCRIPT' || p.tagName === 'STYLE') return NodeFilter.FILTER_REJECT;
      return node.nodeValue && node.nodeValue.toLowerCase().includes(kwLower)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) textNodes.push(n as Text);

  let total = 0;
  for (const tn of textNodes) {
    const text = tn.nodeValue || '';
    const lower = text.toLowerCase();
    let i = 0;
    const frag = document.createDocumentFragment();
    let idx = lower.indexOf(kwLower, i);

    while (idx !== -1) {
      if (idx > i) frag.appendChild(document.createTextNode(text.slice(i, idx)));
      const mark = document.createElement('mark');
      mark.className = MARK_CLASS;
      mark.textContent = text.slice(idx, idx + keyword.length);
      frag.appendChild(mark);
      total++;
      i = idx + keyword.length;
      idx = lower.indexOf(kwLower, i);
    }

    if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
    tn.parentNode?.replaceChild(frag, tn);
  }

  return total;
}

/** 移除所有搜索高亮标记 */
export function clearHighlights(root: HTMLElement): void {
  const marks = root.querySelectorAll(`mark.${MARK_CLASS}, mark.${MARK_CURRENT_CLASS}`);
  marks.forEach((m) => {
    const text = document.createTextNode(m.textContent || '');
    m.parentNode?.replaceChild(text, m);
  });
  root.normalize();
}

/** 聚焦第 index 个匹配项（滚动到视图 + 高亮）
 * @param marks 所有匹配的 mark 元素数组
 * @param index 目标匹配项索引
 * @param container 可选，显式指定滚动容器（推荐传入，避免 findScrollParent 误匹配到内部可滚动元素）
 */
export function focusMatch(marks: HTMLElement[], index: number, container?: HTMLElement | null): void {
  marks.forEach((m, i) => m.classList.toggle(MARK_CURRENT_CLASS, i === index));
  const mark = marks[index];
  if (!mark) return;

  smoothScrollToElement(mark, container, 'center');
}
