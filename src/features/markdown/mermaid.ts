export interface MermaidBlock {
  id: string;
  source: string;
}

const MERMAID_RE = /<div class="mermaid">([\s\S]*?)<\/div>/g;

/** 从渲染后的 HTML 提取 mermaid 块源码 */
export function extractMermaidBlocks(html: string): MermaidBlock[] {
  const blocks: MermaidBlock[] = [];
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = MERMAID_RE.exec(html)) !== null) {
    blocks.push({ id: `mermaid-${i++}`, source: m[1].trim() });
  }
  return blocks;
}

/**
 * 异步把容器内的 mermaid 代码块替换为 SVG。
 *
 * 支持两种来源：
 * 1. markdown-it 输出的 <div class="mermaid">（原样）
 * 2. shiki 高亮后的 <code class="language-mermaid">（转为 .mermaid div 再渲染）
 *
 * 渲染机制：mermaid.render 接受一个可选的"宿主元素"作为第三参数，
 * 传入一个临时 div，让 mermaid 在其中创建/销毁 SVG，避免污染 document.body。
 * （此前的实现没传第三参数，导致 mermaid 把临时节点挂到 body 上，
 * 我们再粗暴 diff body.children 反过来误删了 Lightbox / 各种 Modal。）
 */
export async function renderMermaidInContainer(container: HTMLElement): Promise<void> {
  // 先把 shiki 高亮过的 mermaid 代码块转为 .mermaid div
  const mermaidCodes = container.querySelectorAll<HTMLElement>('code.language-mermaid');
  for (const code of Array.from(mermaidCodes)) {
    const source = code.textContent || '';
    if (!source.trim()) continue;
    // 找到最近的 .code-block-wrapper 或 <pre>，用 .mermaid div 替换
    const wrapper = code.closest('.code-block-wrapper') || code.closest('pre')?.parentElement;
    const target = wrapper && wrapper.classList.contains('code-block-wrapper') ? wrapper : code.closest('pre');
    if (!target) continue;
    const div = document.createElement('div');
    div.className = 'mermaid';
    div.textContent = source;
    target.replaceWith(div);
  }

  const nodes = container.querySelectorAll<HTMLElement>('.mermaid');
  if (nodes.length === 0) return;

  let mermaid: typeof import('mermaid').default;
  try {
    const mod = await import('mermaid');
    mermaid = mod.default;
  } catch (err) {
    console.error('[mermaid] failed to import mermaid module:', err);
    const message = err instanceof Error ? err.message : String(err);
    nodes.forEach((node) => renderMermaidError(node, `import failed: ${message}`));
    return;
  }

  const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default';
  mermaid.initialize({ startOnLoad: false, theme });

  for (const node of Array.from(nodes)) {
    // 首次渲染后 textContent 已被 SVG 替换，源码记在 data 属性里供换主题重绘
    const source = (node.dataset.mermaidSrc || node.textContent || '').trim();
    if (!source) continue;
    if (!node.dataset.mermaidSrc) node.dataset.mermaidSrc = source;

    // 给 mermaid 一个一次性的隐藏宿主元素，render 完直接丢弃。
    // 这样 mermaid 内部的临时 <div id="d…"> 不会出现在 document.body 上。
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;top:-10000px;left:-10000px;width:0;height:0;overflow:hidden;visibility:hidden;';
    document.body.appendChild(host);

    try {
      const id = `m-${Math.random().toString(36).slice(2)}`;
      const { svg } = await mermaid.render(id, source, host);
      node.innerHTML = svg;
    } catch (err) {
      // 之前 catch 完全吞掉错误，用户只看到一个不带信息的红框。
      // 把真实错误写到错误框文案里，方便定位（语法错误、子图加载失败等）。
      const message = err instanceof Error ? err.message : String(err);
      console.error('[mermaid] render failed:', err);
      renderMermaidError(node, message);
    } finally {
      host.remove();
    }
  }
}

function renderMermaidError(node: HTMLElement, detail?: string): void {
  // 不直接把 detail 插到 innerHTML，避免错误信息里含 HTML 时再次注入。
  const errBox = document.createElement('div');
  errBox.className = 'mermaid-error';
  errBox.setAttribute('role', 'note');
  errBox.textContent = detail ? `Mermaid diagram error: ${detail}` : 'Mermaid diagram error';
  node.innerHTML = '';
  node.appendChild(errBox);
}
