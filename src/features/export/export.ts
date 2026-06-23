import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { writeFile } from '../../ipc/files';
import themesCss from '../../styles/themes.css?raw';
import proseCss from '../../styles/prose.css?raw';

export type ExportFormat = 'pdf' | 'html' | 'markdown';

interface ExportDocumentOptions {
  element: HTMLElement;
  source: string;
  fileName: string;
  theme: 'light' | 'dark';
  format: ExportFormat;
}

const EXPORT_FILTERS: Record<ExportFormat, { name: string; extensions: string[] }> = {
  pdf: { name: 'PDF', extensions: ['pdf'] },
  html: { name: 'HTML', extensions: ['html'] },
  markdown: { name: 'Markdown', extensions: ['md'] },
};

const EXTENSIONS: Record<ExportFormat, string> = {
  pdf: 'pdf',
  html: 'html',
  markdown: 'md',
};

/** 读取当前运行时注入的自定义主题 CSS（如有） */
function getActiveThemeCss(): string {
  const el = document.getElementById('custom-theme-css');
  return el?.textContent || '';
}

/** 生成独立 HTML 文件。 */
export function buildStandaloneHtml(
  contentHtml: string,
  css: string,
  theme: 'light' | 'dark',
): string {
  return `<!DOCTYPE html>
<html lang="zh" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>md++ export</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css">
  <style>
    ${BASE_CSS}
    ${css}
    ${getActiveThemeCss()}
  </style>
</head>
<body class="md-content">${contentHtml}</body>
</html>`;
}

export async function exportDocument(options: ExportDocumentOptions): Promise<string | null> {
  if (options.format === 'pdf') {
    // PDF 不走 saveDialog 也不走 Rust：注入隐藏 iframe + 系统打印，
    // 让用户在打印对话框里选"另存为 PDF"。这样 themes.css / prose.css /
    // KaTeX / Mermaid SVG 全部按预览样式输出，而不是把 DOM 抠成纯文本。
    await printDocumentToPdf(options);
    return null;
  }

  const path = await saveDialog({
    defaultPath: replaceExtension(options.fileName, EXTENSIONS[options.format]),
    filters: [EXPORT_FILTERS[options.format]],
  });
  if (!path) return null;

  const content = buildExportContent(options);
  await writeFile(path, content);
  return path;
}

export async function exportPdf(el: HTMLElement, theme: 'light' | 'dark', fileName = 'document.md'): Promise<string | null> {
  return exportDocument({
    element: el,
    source: el.innerText,
    fileName,
    theme,
    format: 'pdf',
  });
}

/**
 * 用主窗口 window.print() + @media print CSS 触发系统打印。
 *
 * macOS 的 WKWebView 不支持 iframe.contentWindow.print()（静默失败），
 * 因此改为在主文档中注入一个 .print-overlay 容器，用 @media print CSS
 * 隐藏所有 UI 元素（TitleBar / Sidebar / SearchBar），只保留要打印的内容。
 *
 * 流程：
 * 1. 注入 <style id="print-overlay-style"> 定义 @media print 规则
 * 2. 注入 <div class="print-overlay"> 包含渲染好的独立 HTML 内容
 * 3. 调用 window.print() 触发系统打印对话框
 * 4. 监听 afterprint 事件清理注入的元素
 */
async function printDocumentToPdf(options: ExportDocumentOptions): Promise<void> {
  const contentHtml = buildStandaloneHtml(options.element.innerHTML, PRINT_CSS, options.theme);

  // 提取 <body> 内的 HTML（跳过外层 html/head/body 标签）
  const bodyMatch = contentHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const innerHtml = bodyMatch ? bodyMatch[1] : options.element.innerHTML;

  // 提取 <style> 块
  const styleMatches = contentHtml.match(/<style>([\s\S]*?)<\/style>/gi) || [];
  const combinedStyle = styleMatches
    .map((s) => s.replace(/<\/?style>/gi, ''))
    .join('\n');

  // 注入 @media print 样式：隐藏一切，只显示 .print-overlay
  const printStyle = document.createElement('style');
  printStyle.id = 'print-overlay-style';
  printStyle.textContent = `
    @media print {
      body > *:not(.print-overlay) { display: none !important; }
      .print-overlay {
        position: static !important;
        width: auto !important;
        height: auto !important;
        overflow: visible !important;
        background: #ffffff !important;
      }
    }
    ${combinedStyle}
  `;
  document.head.appendChild(printStyle);

  // 注入打印内容容器
  const overlay = document.createElement('div');
  overlay.className = 'print-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:99999;background:#fff;overflow:auto;padding:40px 32px;';
  overlay.innerHTML = `<div class="md-content" style="max-width:860px;margin:0 auto;">${innerHtml}</div>`;
  document.body.appendChild(overlay);

  try {
    await new Promise<void>((resolve) => {
      const cleanup = () => {
        window.removeEventListener('afterprint', cleanup);
        overlay.remove();
        printStyle.remove();
        resolve();
      };
      window.addEventListener('afterprint', cleanup);

      // 等下一帧让浏览器把 KaTeX / shiki / mermaid SVG 都布好版
      requestAnimationFrame(() => {
        window.print();
        // 兜底：如果 afterprint 未触发（某些 WebView），3 秒后清理
        setTimeout(cleanup, 3000);
      });
    });
  } catch {
    // 异常时也要清理
    overlay.remove();
    printStyle.remove();
  }
}

function buildExportContent(options: ExportDocumentOptions): string {
  if (options.format === 'markdown') return options.source;
  // format === 'html'
  return buildStandaloneHtml(options.element.innerHTML, '', options.theme);
}

function replaceExtension(fileName: string, extension: string): string {
  const clean = fileName.trim() || 'document';
  return clean.replace(/\.[^.\\/]+$/, '') + `.${extension}`;
}

const APP_CSS = `${themesCss}\n${proseCss}`.trim() || `
.code-block-wrapper {
  position: relative;
  margin: 16px 0;
}
.code-block-wrapper pre {
  margin: 0;
}
.github-alert,
.md-container {
  padding: 10px 14px;
  margin: 16px 0;
  background: var(--bg-secondary);
  border-radius: 8px;
}
`;

const BASE_CSS = `
${APP_CSS}

html,
body {
  min-height: 100%;
}

body.md-content {
  display: block;
  max-width: 860px;
  margin: 0 auto;
  padding: 40px 32px 72px;
  overflow: visible;
}

body.md-content .back-to-top,
body.md-content .word-count-badge,
body.md-content .code-block-copy,
body.md-content .code-block-lang {
  display: none;
}

:root {
  --bg: #ffffff;
  --fg: rgb(60 60 67);
  --bg-secondary: #f6f6f7;
  --fg-muted: rgb(60 60 67 / 0.78);
  --border: #e2e2e3;
  --accent: #5086a1;
  --accent-soft: rgb(131 208 218 / 0.14);
  --code-bg: #f6f8fa;
  --code-inline-bg: rgb(142 150 170 / 0.14);
  --code-inline-fg: #5086a1;
  --mark-linear-color: #8cccd5;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --t-color: 250ms ease;
}

:root[data-theme="dark"] {
  --bg: #1b1b1f;
  --fg: rgb(255 255 245 / 0.86);
  --bg-secondary: #161618;
  --fg-muted: rgb(235 235 245 / 0.6);
  --border: #2e2e32;
  --accent: #8cccd5;
  --accent-soft: rgb(131 208 218 / 0.14);
  --code-bg: #202127;
  --code-inline-bg: rgb(101 117 133 / 0.16);
  --code-inline-fg: #8cccd5;
  --mark-linear-color: #5086a1;
}

body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-ui);
  font-size: 15px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  margin: 0;
}
`;

/**
 * 打印场景额外补丁：
 * - print-color-adjust: exact 保证背景色 / 代码块底色 / GitHub Alert 配色被打印
 * - @page 控制纸张边距，避免 webview 的默认页边距把内容挤到只剩一半
 * - 强制 light 主题：暗色背景会被浏览器打印逻辑拒绝（节省墨水）
 * - 代码块、表格、Mermaid SVG 禁止跨页断开
 */
const PRINT_CSS = `
  html, body {
    background: #ffffff !important;
    color: rgb(35 35 40) !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page {
    size: A4;
    margin: 18mm 16mm;
  }
  @media print {
    body.md-content {
      max-width: none;
      margin: 0;
      padding: 0;
    }
    pre, .code-block-wrapper, table, .mermaid, blockquote, .github-alert, .md-container {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    h1, h2, h3 {
      break-after: avoid;
      page-break-after: avoid;
    }
    img, svg {
      max-width: 100%;
    }
    a {
      color: inherit;
      text-decoration: none;
    }
  }
`;
