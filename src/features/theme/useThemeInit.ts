import { useEffect, useRef } from 'react';
import { useThemeStore } from '../../stores/themeStore';
import { renderMermaidInContainer } from '../markdown/mermaid';

/**
 * 主题变化后只需重绘 Mermaid（SVG 颜色是内联的）。
 * 代码高亮走双主题 CSS 变量，不再重新渲染整篇文档。
 */
export function useThemeInit() {
  const resolved = useThemeStore((s) => s.resolved);
  const mounted = useRef(false);

  useEffect(() => {
    // 首次挂载时 Mermaid 已由渲染管线绘制，跳过
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    document.querySelectorAll<HTMLElement>('.md-content').forEach((el) => {
      if (el.querySelector('.mermaid[data-mermaid-src]')) {
        renderMermaidInContainer(el).catch(console.error);
      }
    });
  }, [resolved]);
}
