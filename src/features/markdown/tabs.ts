/**
 * `::: tabs` 容器 + `@tab 标题` → 可切换标签页。
 *
 * markdown-it 只负责把内容渲染成普通节点，这里按 @tab 段落切分，
 * 组装成「按钮栏 + 面板」，点击按钮切换显示。
 */

interface TabGroup {
  title: string;
  nodes: Node[];
}

/** 读取 `@tab 标题` 段落；标记后同一段落剩下的文字保留在 node 里 */
function readTabMarker(node: Node): { title: string; hasBody: boolean } | null {
  if (!(node instanceof HTMLElement) || node.tagName !== 'P') return null;
  const text = (node.textContent ?? '').trim();
  const match = text.match(/^@tab[ \t]+([^\n]+)(?:\n([\s\S]*))?$/);
  if (!match) return null;

  const rest = match[2]?.trim() ?? '';
  if (rest) node.textContent = rest;
  return { title: match[1].trim(), hasBody: Boolean(rest) };
}

export function setupTabs(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>('.md-tabs').forEach((tabs) => {
    if (tabs.dataset.mdTabsReady === 'true') return;

    const groups: TabGroup[] = [];
    const leading: Node[] = [];
    let current: TabGroup | null = null;

    for (const node of Array.from(tabs.childNodes)) {
      const marker = readTabMarker(node);
      if (marker) {
        current = { title: marker.title, nodes: marker.hasBody ? [node] : [] };
        groups.push(current);
      } else if (current) {
        current.nodes.push(node);
      } else {
        leading.push(node);
      }
    }
    if (!groups.length) return;

    tabs.dataset.mdTabsReady = 'true';
    groups[0].nodes.unshift(...leading);

    const nav = document.createElement('div');
    nav.className = 'md-tabs-nav';
    nav.setAttribute('role', 'tablist');

    const panes: HTMLElement[] = [];
    const buttons: HTMLButtonElement[] = [];

    const select = (index: number) => {
      buttons.forEach((btn, i) => {
        const active = i === index;
        btn.classList.toggle('md-tab-active', active);
        btn.setAttribute('aria-selected', String(active));
        btn.tabIndex = active ? 0 : -1;
      });
      panes.forEach((pane, i) => pane.classList.toggle('md-tab-active', i === index));
    };

    groups.forEach((group, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'md-tab-btn';
      btn.textContent = group.title;
      btn.setAttribute('role', 'tab');
      btn.addEventListener('click', () => select(index));

      const pane = document.createElement('div');
      pane.className = 'md-tab-content';
      pane.setAttribute('role', 'tabpanel');
      group.nodes.forEach((node) => pane.appendChild(node));

      nav.appendChild(btn);
      buttons.push(btn);
      panes.push(pane);
    });

    tabs.replaceChildren(nav, ...panes);
    select(0);
  });
}
