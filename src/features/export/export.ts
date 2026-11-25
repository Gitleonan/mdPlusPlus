import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import {
  getAppDataDir,
  IMAGE_PLACEHOLDER,
  readImagesAsDataUrls,
  writeFile,
} from '../../ipc/files';
import { openFileWithSystem } from '../../ipc/opener';
import themesCss from '../../styles/themes.css?raw';
import proseCss from '../../styles/prose.css?raw';
import katexCss from 'katex/dist/katex.min.css?raw';
import katexFontAmWoff2 from 'katex/dist/fonts/KaTeX_AMS-Regular.woff2?url';
import katexFontCalBoldWoff2 from 'katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2?url';
import katexFontCalWoff2 from 'katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2?url';
import katexFontFrakturBoldWoff2 from 'katex/dist/fonts/KaTeX_Fraktur-Bold.woff2?url';
import katexFontFrakturWoff2 from 'katex/dist/fonts/KaTeX_Fraktur-Regular.woff2?url';
import katexFontMainBoldWoff2 from 'katex/dist/fonts/KaTeX_Main-Bold.woff2?url';
import katexFontMainBoldItalicWoff2 from 'katex/dist/fonts/KaTeX_Main-BoldItalic.woff2?url';
import katexFontMainItalicWoff2 from 'katex/dist/fonts/KaTeX_Main-Italic.woff2?url';
import katexFontMainWoff2 from 'katex/dist/fonts/KaTeX_Main-Regular.woff2?url';
import katexFontMathBoldItalicWoff2 from 'katex/dist/fonts/KaTeX_Math-BoldItalic.woff2?url';
import katexFontMathItalicWoff2 from 'katex/dist/fonts/KaTeX_Math-Italic.woff2?url';
import katexFontSansBoldWoff2 from 'katex/dist/fonts/KaTeX_SansSerif-Bold.woff2?url';
import katexFontSansItalicWoff2 from 'katex/dist/fonts/KaTeX_SansSerif-Italic.woff2?url';
import katexFontSansWoff2 from 'katex/dist/fonts/KaTeX_SansSerif-Regular.woff2?url';
import katexFontScriptWoff2 from 'katex/dist/fonts/KaTeX_Script-Regular.woff2?url';
import katexFontSize1Woff2 from 'katex/dist/fonts/KaTeX_Size1-Regular.woff2?url';
import katexFontSize2Woff2 from 'katex/dist/fonts/KaTeX_Size2-Regular.woff2?url';
import katexFontSize3Woff2 from 'katex/dist/fonts/KaTeX_Size3-Regular.woff2?url';
import katexFontSize4Woff2 from 'katex/dist/fonts/KaTeX_Size4-Regular.woff2?url';
import katexFontTypewriterWoff2 from 'katex/dist/fonts/KaTeX_Typewriter-Regular.woff2?url';

export type ExportFormat = 'pdf' | 'html' | 'markdown';

interface ExportDocumentOptions {
  element: HTMLElement;
  source: string;
  filePath: string;
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
  exportKatexCss = '',
): string {
  return `<!DOCTYPE html>
<html lang="zh" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>md++ export</title>
  <style>
    ${exportKatexCss}
    ${BASE_CSS}
    ${css}
    ${getActiveThemeCss()}
    ${PRINT_CSS}
  </style>
</head>
<body class="md-content">${contentHtml}</body>
</html>`;
}

const KATEX_FONT_URLS: Record<string, string> = {
  'KaTeX_AMS-Regular.woff2': katexFontAmWoff2,
  'KaTeX_Caligraphic-Bold.woff2': katexFontCalBoldWoff2,
  'KaTeX_Caligraphic-Regular.woff2': katexFontCalWoff2,
  'KaTeX_Fraktur-Bold.woff2': katexFontFrakturBoldWoff2,
  'KaTeX_Fraktur-Regular.woff2': katexFontFrakturWoff2,
  'KaTeX_Main-Bold.woff2': katexFontMainBoldWoff2,
  'KaTeX_Main-BoldItalic.woff2': katexFontMainBoldItalicWoff2,
  'KaTeX_Main-Italic.woff2': katexFontMainItalicWoff2,
  'KaTeX_Main-Regular.woff2': katexFontMainWoff2,
  'KaTeX_Math-BoldItalic.woff2': katexFontMathBoldItalicWoff2,
  'KaTeX_Math-Italic.woff2': katexFontMathItalicWoff2,
  'KaTeX_SansSerif-Bold.woff2': katexFontSansBoldWoff2,
  'KaTeX_SansSerif-Italic.woff2': katexFontSansItalicWoff2,
  'KaTeX_SansSerif-Regular.woff2': katexFontSansWoff2,
  'KaTeX_Script-Regular.woff2': katexFontScriptWoff2,
  'KaTeX_Size1-Regular.woff2': katexFontSize1Woff2,
  'KaTeX_Size2-Regular.woff2': katexFontSize2Woff2,
  'KaTeX_Size3-Regular.woff2': katexFontSize3Woff2,
  'KaTeX_Size4-Regular.woff2': katexFontSize4Woff2,
  'KaTeX_Typewriter-Regular.woff2': katexFontTypewriterWoff2,
};

const FONT_FACE_RE = /@font-face\s*\{[^}]*\}/g;
const KATEX_WOFF2_RE = /url\(fonts\/([^)"']+\.woff2)\)/;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function loadKatexFont(fileName: string): Promise<string> {
  const url = KATEX_FONT_URLS[fileName];
  if (!url) throw new Error(`unknown KaTeX font: ${fileName}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`failed to load ${fileName}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return `data:font/woff2;base64,${bytesToBase64(bytes)}`;
}

/**
 * 把 KaTeX 的 woff2 引用替换为 data URL。
 *
 * 只保留 woff2 一项：woff/ttf 是给旧浏览器准备的，留在导出文件里会让
 * 外部浏览器尝试访问应用内的相对资源。读取失败的字体只移除对应
 * `@font-face`，其余样式和文档内容仍可正常导出。
 */
export async function inlineKatexFontFaces(
  css: string,
  loadFont: (fileName: string) => Promise<string> = loadKatexFont,
): Promise<string> {
  if (!css) return '';
  const matches = Array.from(css.matchAll(FONT_FACE_RE));
  if (matches.length === 0) return css;

  const loaded = new Map<string, Promise<string>>();
  const loadOnce = (fileName: string): Promise<string> => {
    const existing = loaded.get(fileName);
    if (existing) return existing;
    const promise = loadFont(fileName);
    loaded.set(fileName, promise);
    return promise;
  };

  const blocks = await Promise.all(matches.map(async (match) => {
    const block = match[0];
    const font = block.match(KATEX_WOFF2_RE)?.[1];
    if (!font) return block;
    try {
      const dataUrl = await loadOnce(font);
      return block.replace(
        /src:[^;}]+/,
        `src:url("${dataUrl}") format("woff2")`,
      );
    } catch (err) {
      console.error(`[export] failed to inline KaTeX font ${font}`, err);
      return '';
    }
  }));

  let result = '';
  let lastIndex = 0;
  matches.forEach((match, index) => {
    const start = match.index ?? 0;
    result += css.slice(lastIndex, start);
    result += blocks[index];
    lastIndex = start + match[0].length;
  });
  return result + css.slice(lastIndex);
}

let exportKatexCssPromise: Promise<string> | null = null;

/**
 * 导出的 HTML/PDF 必须可离线打开：KaTeX 字体改用构建产物地址，
 * 不再向 Google Fonts / jsDelivr 发起请求。
 */
async function getExportKatexCss(): Promise<string> {
  if (!exportKatexCssPromise) {
    exportKatexCssPromise = inlineKatexFontFaces(katexCss);
  }
  return exportKatexCssPromise;
}

export async function exportDocument(options: ExportDocumentOptions): Promise<string | null> {
  if (options.format === 'pdf') {
    // macOS WKWebView does not reliably support window.print() with @media
    // print overlays — the print dialog shows the app UI rather than exported
    // content.  Instead, generate standalone HTML, save it as a temp file, and
    // open it in the user's default browser where "Save as PDF" works natively
    // on every platform.
    const html = await buildExportHtml(options);
    // Inject an auto-print script so the browser's print dialog opens on load
    const printHtml = html.replace(
      '</head>',
      '<script>window.addEventListener("DOMContentLoaded",()=>{setTimeout(()=>window.print(),400)});</script></head>',
    );
    // Write to a temp .html file (not .pdf) so the OS opens it in a browser
    const tmpPath = await getTempExportPath(options.fileName);
    await writeFile(tmpPath, printHtml);
    // Ask the OS to open the HTML file in the default browser (bypassing
    // opener plugin ACL — the temp dir isn't in the plugin's allowlist)
    await openFileWithSystem(tmpPath);
    return null;
  }

  const path = await saveDialog({
    defaultPath: replaceExtension(options.fileName, EXTENSIONS[options.format]),
    filters: [EXPORT_FILTERS[options.format]],
  });
  if (!path) return null;

  const content = options.format === 'markdown'
    ? options.source
    : await buildExportHtml(options);
  await writeFile(path, content);
  return path;
}

export async function exportPdf(
  el: HTMLElement,
  theme: 'light' | 'dark',
  fileName = 'document.md',
  filePath = '',
): Promise<string | null> {
  return exportDocument({
    element: el,
    source: el.innerText,
    filePath,
    fileName,
    theme,
    format: 'pdf',
  });
}

/** 生成临时导出文件路径（在 app data dir 下，避免权限问题） */
async function getTempExportPath(fileName: string): Promise<string> {
  const dir = await getAppDataDir();
  const base = replaceExtension(fileName, 'html');
  // 替换路径分隔符避免子目录
  const safe = base.replace(/[/\\]/g, '_');
  // 路径拼接：在 Linux 沙盒中 app_data_dir 返回的路径已规范化
  const sep = dir.endsWith('/') || dir.endsWith('\\') ? '' : '/';
  return `${dir}${sep}${safe}`;
}

/**
 * 克隆预览 DOM 生成导出的 HTML，并把本地图片内联成 data URL。
 *
 * 不能直接拿预览 DOM 的 innerHTML：图片已由 `mdpp-img` 自定义协议接管，
 * 该地址只在应用 WebView 内有效；复制到外部浏览器后图片会全部失效。
 */
async function buildExportHtml(options: ExportDocumentOptions): Promise<string> {
  const container = document.createElement('div');
  container.innerHTML = options.element.innerHTML;

  // `data-image-src` 是图片解析完成后的原始地址；若用户在解析完成前导出，
  // 未带该属性的本地相对路径也要一并收集。
  // 选择器不能表达大小写不敏感，网络地址在遍历时再排除，避免把
  // `HTTPS://…` 这类合法远程图片当作本地文件读取并替换成占位图。
  const imgs = Array.from(container.querySelectorAll<HTMLImageElement>('img'))
    .filter((img) => {
      const src = img.getAttribute('data-image-src') || img.getAttribute('src') || '';
      return !/^(https?:|data:)/i.test(src);
    });
  if (imgs.length > 0) {
    const srcs = Array.from(
      new Set(
        imgs
          .map((img) => img.getAttribute('data-image-src') || img.getAttribute('src') || '')
          .filter(Boolean),
      ),
    );
    try {
      const dataUrls = await readImagesAsDataUrls(options.filePath, srcs);
      imgs.forEach((img) => {
        const src = img.getAttribute('data-image-src') || img.getAttribute('src') || '';
        const dataUrl = dataUrls.get(src);
        img.setAttribute('src', dataUrl ?? IMAGE_PLACEHOLDER);
        img.removeAttribute('data-image-src');
      });
    } catch (err) {
      // 导出不应因图片读取失败而整体失败；本地图片换成内嵌占位图，
      // 不能保留只在本应用 WebView 内有效的 mdpp-img 地址。
      console.error('[export] failed to inline local images', err);
      imgs.forEach((img) => {
        img.setAttribute('src', IMAGE_PLACEHOLDER);
        img.removeAttribute('data-image-src');
      });
    }
  }

  const katexCss = await getExportKatexCss();
  return buildStandaloneHtml(container.innerHTML, '', options.theme, katexCss);
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
    .table-scroll { overflow: visible; }
    .table-hscroll { display: none; }
    .md-tabs-nav { display: none; }
    .md-tab-content { display: block !important; }
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
