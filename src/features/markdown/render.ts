import { md, createMarkdownItWithHtml } from './plugins';

/**
 * 将 markdown 源文本渲染为 HTML。
 *
 * 注意：此函数输出不含 shiki 代码高亮与 mermaid SVG，
 * 二者在渲染后处理阶段（highlight.ts / mermaid.ts）单独执行。
 * 代码块保留为 <pre><code class="language-xxx">，等待 shiki 替换。
 *
 * 已支持的扩展语法：
 * - GitHub Alerts: > [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION]
 * - 容器: ::: note / info / tip / warning / caution / details
 * - 标签页: ::: tabs + @tab
 * - 代码组: ::: code-group
 * - 代码块标题: ```js title="file.js"
 * - 上标/下标: H~2~O / 19^th^
 * - Emoji 短码: :smile: :heart:
 * - 缩写: *[HTML]: Hyper Text Markup Language
 */
export function renderMarkdown(source: string): string {
  return md.render(source);
}

/** 用于修订模式：允许 HTML 标记（注释）通过，以注入高亮标记 */
const mdHtml = createMarkdownItWithHtml();
export function renderMarkdownWithHtml(source: string): string {
  return mdHtml.render(source);
}
