import type MarkdownIt from 'markdown-it';

/**
 * 代码块增强功能：
 * 1. 代码块标题（title="filename"）
 * 2. 行高亮（// [!code highlight]）
 * 3. 行差异（// [!code ++] / // [!code --]）
 * 4. 行聚焦（// [!code focus]）
 * 5. 行错误/警告（// [!code error] / // [!code warning]）
 * 6. 行号 + 缩进参考线（shiki 高亮后注入）
 */

interface LineMark {
  line: number; // 0-indexed
  type: 'highlight' | 'focus' | 'error' | 'warning' | 'add' | 'remove';
}

/** 代码块标题：```js title="file.js" */
export function setupCodeBlockTitle(md: MarkdownIt): void {
  md.renderer.rules.fence = (tokens, idx, _options, _env, _self) => {
    const token = tokens[idx];
    const info = token.info.trim();

    // 解析 title="..." 或 title='...'
    const titleMatch = info.match(/title=["']([^"']+)["']/);
    const title = titleMatch ? titleMatch[1] : null;

    // 移除 title 部分，保留语言
    const lang = info.replace(/\s*title=["'][^"']*["']/, '').trim().split(/\s+/)[0] || '';

    // 构建代码块 HTML
    let html = '';

	    // 解析行标记
	    const rawLines = token.content.split('\n');
	    // markdown-it 的 fence token.content 末尾固定带一个 \n，
	    // 去掉 split 产生的空串，避免 cleanContent 末尾多出空行
	    if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
	      rawLines.pop();
	    }
	    const lineMarks = parseLineMarks(rawLines);

    // 将行标记序列化为 data 属性，供高亮后注入样式
    const marksAttr = lineMarks.length > 0
      ? ` data-line-marks="${escapeAttr(JSON.stringify(lineMarks))}"`
      : '';

    if (title) {
      html += `<div class="code-block-wrapper has-title"${marksAttr}>\n`;
      html += `<div class="code-block-title">${escapeHtml(title)}</div>\n`;
    } else {
      html += `<div class="code-block-wrapper"${marksAttr}>\n`;
    }

	    // 移除标记注释，生成干净的代码（支持 // 和 # 风格）
	    const cleanContent = rawLines
	      .map((line) => line.replace(/\s*(?:\/\/|#)\s*\[!code\s+(highlight|focus|error|warning|\+\+|--)\]\s*$/, ''))
	      .join('\n');

    // 生成带语言的代码块
    const langClass = lang ? ` class="language-${lang}"` : '';
    html += `<pre><code${langClass}>${escapeHtml(cleanContent)}</code></pre>`;
    html += `</div>\n`;

    return html;
  };
}

/**
 * 向已高亮的 HTML 注入行号。
 * shiki codeToHtml 输出 <span class="line">…</span> 结构，
 * 在 <pre> 开标签前插入 .line-numbers 容器。
 */
export function injectLineNumbers(html: string): string {
  // 匹配 wrapper 开标签到 <pre 的全部内容（含可选 title + shiki 输出）
  return html.replace(
    /(<div class="code-block-wrapper[^"]*)(">[\s\S]*?)(<pre)/g,
    (_match, wrapperStart, middle, preTag) => {
      // 已经注入过则跳过
      if (middle.includes('line-numbers')) return _match;

      // 统计 shiki 行数
      const lineCount = (middle.match(/<span class="line"/g) || []).length;
      if (lineCount < 2) return _match;

      // 给 wrapper 加 line-numbers-mode
      const patched = wrapperStart.replace(
        'code-block-wrapper',
        'code-block-wrapper line-numbers-mode',
      );

      let nums = '<div class="line-numbers">';
      for (let i = 1; i <= lineCount; i++) {
        nums += `<span class="line-number">${i}</span>`;
      }
      nums += '</div>';

      return `${patched}${middle}${nums}${preTag}`;
    },
  );
}

/**
 * 向已高亮的 HTML 注入缩进参考线。
 * 在每个 <span class="line"> 内部，分析前导空白并插入 .indent 元素。
 */
export function injectIndentGuides(html: string): string {
  return html.replace(
    /<span class="line">(.*?)<\/span>/g,
    (match, lineContent) => {
      // 提取前导空白文本节点
      const leadingMatch = lineContent.match(/^((?:<[^>]+>)*\s+)/);
      if (!leadingMatch) return match;

      const leading = leadingMatch[1];
      // 从纯文本中计算空格数（去除 HTML 标签）
      const plainLeading = leading.replace(/<[^>]+>/g, '');
      const spaces = plainLeading.length;

      if (spaces < 2) return match;

      const indentCount = Math.floor(spaces / 2);
      let indentHtml = '';
      for (let i = 0; i < indentCount; i++) {
        indentHtml += `<span class="indent" style="--indent-offset: ${i * 2}ch"></span>`;
      }

      // 在前导空白之后插入 indent 元素
      return match.replace(leading, `${indentHtml}${leading}`);
    },
  );
}

/** 解析代码块中的行标记注释（支持 // 和 # 风格） */
function parseLineMarks(lines: string[]): LineMark[] {
  const marks: LineMark[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/(?:\/\/|#)\s*\[!code\s+(highlight|focus|error|warning|\+\+|--)\]\s*$/);
    if (match) {
      const typeStr = match[1];
      let type: LineMark['type'];
      switch (typeStr) {
        case 'highlight': type = 'highlight'; break;
        case 'focus': type = 'focus'; break;
        case 'error': type = 'error'; break;
        case 'warning': type = 'warning'; break;
        case '++': type = 'add'; break;
        case '--': type = 'remove'; break;
        default: continue;
      }
      marks.push({ line: i, type });
    }
  }
  return marks;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
