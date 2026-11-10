import { md, createMarkdownItWithHtml } from './plugins';

const FENCE = /^\s*(```|~~~)/;
const DETAILS_OPEN = /^\s*<details(?:\s[^>]*)?>\s*$/i;
const DETAILS_CLOSE = /^\s*<\/details\s*>\s*$/i;
const SUMMARY_LINE = /^\s*<summary(?:\s[^>]*)?>(.*?)<\/summary\s*>\s*$/i;
const DETAILS_INLINE =
  /^\s*<details(?:\s[^>]*)?>\s*<summary(?:\s[^>]*)?>(.*?)<\/summary\s*>\s*$/i;

/**
 * 原生 <details><summary>…</summary></details> 转为已有的 ::: details 容器：
 * 内部内容继续按 Markdown 解析。代码块里的标签原样保留。
 * ponytail: 只认块级写法与 <details><summary>…</summary> 同一行，其余原样转义。
 */
const TABLE_LINE = /^\s*\|/;
const CODE_SPAN = /(`+)([\s\S]*?)\1/g;
const PIPE = '';

/**
 * 表格单元格里的行内代码含 `|` 时（如 `MTR:锭号|B:批次号`），
 * markdown-it 会把它当单元格分隔符。先把代码内的 `|` 换成占位符，渲染后再还原。
 */
function protectTablePipes(source: string): string {
  if (!source.includes('|')) return source;
  return source
    .split('\n')
    .map((line) =>
      TABLE_LINE.test(line)
        ? line.replace(CODE_SPAN, (_, ticks: string, body: string) =>
            ticks + body.replace(/\|/g, PIPE) + ticks,
          )
        : line,
    )
    .join('\n');
}

function normalizeDetails(source: string): string {
  if (!/<details/i.test(source)) return source;

  const lines = source.split('\n');
  const out: string[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    const inline = line.match(DETAILS_INLINE);
    if (inline) {
      out.push(`::: details ${inline[1].trim()}`);
      continue;
    }
    if (DETAILS_CLOSE.test(line)) {
      out.push(':::');
      continue;
    }
    if (DETAILS_OPEN.test(line)) {
      const summary = (lines[i + 1] ?? '').match(SUMMARY_LINE);
      if (summary) {
        out.push(`::: details ${summary[1].trim()}`);
        i++;
      } else {
        out.push('::: details Details');
      }
      continue;
    }
    out.push(line);
  }

  return out.join('\n');
}

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
  return md.render(protectTablePipes(normalizeDetails(source))).split(PIPE).join('|');
}

/** 用于修订模式：允许 HTML 标记（注释）通过，以注入高亮标记 */
const mdHtml = createMarkdownItWithHtml();
export function renderMarkdownWithHtml(source: string): string {
  return mdHtml.render(protectTablePipes(normalizeDetails(source))).split(PIPE).join('|');
}
