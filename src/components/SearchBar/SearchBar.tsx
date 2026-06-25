import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import { useSearchStore } from '../../stores/searchStore';
import { useTabsStore } from '../../stores/tabsStore';
import { highlightMatches, clearHighlights, focusMatch } from '../../features/search/search';

interface SearchBarProps {
  contentRef: React.RefObject<HTMLDivElement>;
}

export function SearchBar({ contentRef }: SearchBarProps) {
  const { visible, keyword, total, current, setKeyword, setVisible, setResult, next, prev } =
    useSearchStore();
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) inputRef.current?.focus();
  }, [visible]);

  useEffect(() => {
    const el = contentRef.current;
    if (!visible && el) {
      clearHighlights(el);
      setKeyword('');
      setResult(0, 0);
    }
  }, [visible, contentRef, setKeyword, setResult]);

  // 获取当前 tab 的 html，用于感知内容变化
  const tabHtml = useTabsStore((s) => {
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    return active?.html;
  });

  // 搜索关键词或内容变化时重新高亮
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    if (!keyword) {
      clearHighlights(el);
      setResult(0, 0);
      return;
    }
    // 等 DOM 更新完毕后再搜索
    requestAnimationFrame(() => {
      const el = contentRef.current;
      if (!el) return;
      const total = highlightMatches(el, keyword);
      if (total > 0) {
        const marks = Array.from(el.querySelectorAll<HTMLElement>('mark.search-mark'));
        focusMatch(marks, 0, el);
        setResult(total, 0);
      } else {
        setResult(0, 0);
      }
    });
  }, [keyword, activeTabId, tabHtml, contentRef, setResult]);

  // 当前匹配项变化时聚焦
  useEffect(() => {
    const el = contentRef.current;
    if (!el || total === 0) return;
    const marks = Array.from(el.querySelectorAll<HTMLElement>('mark.search-mark'));
    focusMatch(marks, current, el);
  }, [current, total, contentRef]);

  const clearKeyword = () => {
    const el = contentRef.current;
    if (el) clearHighlights(el);
    setKeyword('');
    setResult(0, 0);
    inputRef.current?.focus();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="searchbar"
          initial={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        >
      <div className="searchbar-input-wrap">
        <input
          ref={inputRef}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.shiftKey ? prev() : next(); }
            if (e.key === 'Escape') setVisible(false);
          }}
          placeholder="搜索..."
          className="searchbar-input"
        />
        {keyword && (
          <button className="searchbar-clear" onClick={clearKeyword} title="清空搜索" aria-label="清空搜索">
            <X size={12} strokeWidth={2} />
          </button>
        )}
      </div>
      <span className="searchbar-count">
        {total > 0 ? `${current + 1}/${total}` : '0/0'}
      </span>
      <button className="searchbar-btn" onClick={prev} title="上一个">
        <ChevronUp size={14} strokeWidth={1.5} />
      </button>
      <button className="searchbar-btn" onClick={next} title="下一个">
        <ChevronDown size={14} strokeWidth={1.5} />
      </button>
      <button className="searchbar-btn" onClick={() => setVisible(false)} title="关闭">
        <X size={14} strokeWidth={1.5} />
      </button>
    </motion.div>
    )}
  </AnimatePresence>
  );
}
