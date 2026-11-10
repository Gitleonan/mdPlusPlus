import { describe, it, expect, beforeEach } from 'vitest';
import { setupTabs } from './tabs';

function renderTabs(html: string): HTMLElement {
  document.body.innerHTML = `<div class="md-content">${html}</div>`;
  const container = document.querySelector<HTMLElement>('.md-content')!;
  setupTabs(container);
  return container;
}

describe('setupTabs', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('把 @tab 段落切成按钮和面板，默认选中第一个', () => {
    const container = renderTabs(
      '<div class="md-tabs"><p>@tab SQL</p><pre>select 1</pre><p>@tab JSON</p><pre>{}</pre></div>',
    );
    const buttons = container.querySelectorAll('.md-tab-btn');
    const panes = container.querySelectorAll('.md-tab-content');

    expect([...buttons].map((b) => b.textContent)).toEqual(['SQL', 'JSON']);
    expect(panes.length).toBe(2);
    expect(buttons[0].classList.contains('md-tab-active')).toBe(true);
    expect(panes[0].classList.contains('md-tab-active')).toBe(true);
    expect(buttons[0].getAttribute('aria-selected')).toBe('true');
    expect(panes[0].textContent).toContain('select 1');
  });

  it('点击按钮切换标签页', () => {
    const container = renderTabs(
      '<div class="md-tabs"><p>@tab A</p><p>a</p><p>@tab B</p><p>b</p></div>',
    );
    const buttons = container.querySelectorAll<HTMLButtonElement>('.md-tab-btn');
    buttons[1].click();

    const panes = container.querySelectorAll('.md-tab-content');
    expect(buttons[0].classList.contains('md-tab-active')).toBe(false);
    expect(buttons[1].classList.contains('md-tab-active')).toBe(true);
    expect(panes[1].classList.contains('md-tab-active')).toBe(true);
  });

  it('@tab 同一段落里紧跟的正文保留在面板中', () => {
    const container = renderTabs(
      '<div class="md-tabs"><p>@tab 说明\n第一行正文</p></div>',
    );
    const pane = container.querySelector('.md-tab-content')!;
    expect(pane.textContent).toContain('第一行正文');
    expect(pane.textContent).not.toContain('@tab');
  });

  it('重复调用不会重复组装', () => {
    const container = renderTabs(
      '<div class="md-tabs"><p>@tab A</p><p>a</p><p>@tab B</p><p>b</p></div>',
    );
    setupTabs(container);
    expect(container.querySelectorAll('.md-tabs-nav').length).toBe(1);
    expect(container.querySelectorAll('.md-tab-btn').length).toBe(2);
  });
});
