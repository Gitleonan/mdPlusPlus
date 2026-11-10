import { describe, it, expect, beforeEach } from 'vitest';
import { enhanceTables, resetSavedTableWidths } from './table-resize';

function renderTable(widths: number[]) {
  document.body.innerHTML = `<div class="md-content"><table><thead><tr>${widths
    .map(() => '<th>h</th>')
    .join('')}</tr></thead><tbody><tr>${widths.map(() => '<td>c</td>').join('')}</tr></tbody></table></div>`;
  const container = document.querySelector<HTMLElement>('.md-content')!;
  const table = container.querySelector('table')!;
  const ths = Array.from(table.querySelectorAll('th'));
  ths.forEach((th, i) => {
    // jsdom 无布局：有显式宽度时返回显式宽度，否则返回初始宽度
    th.getBoundingClientRect = () =>
      ({ width: th.style.width ? parseFloat(th.style.width) : widths[i] }) as DOMRect;
  });
  return { container, table, ths };
}

function pointer(type: string, clientX: number) {
  document.querySelector('.table-col-resizer')!.dispatchEvent(
    new MouseEvent(type, { clientX, bubbles: true }),
  );
  // 移动/抬起监听在 document 上
  if (type !== 'pointerdown') document.dispatchEvent(new MouseEvent(type, { clientX }));
}

describe('enhanceTables', () => {
  beforeEach(() => {
    resetSavedTableWidths();
    document.body.className = '';
  });

  it('注入拖拽手柄，不改变默认自动列宽', () => {
    const { container, table, ths } = renderTable([100, 80]);
    enhanceTables(container, 'tab-1');
    expect(ths[0].querySelector('.table-col-resizer')).not.toBeNull();
    expect(table.style.tableLayout).toBe('');
    expect(table.parentElement?.classList.contains('table-scroll')).toBe(true);
  });

  it('拖到极窄时列宽钳制在最小宽度', () => {
    const { container, table, ths } = renderTable([100, 80]);
    enhanceTables(container, 'tab-1');

    pointer('pointerdown', 100);
    pointer('pointermove', 100 - 200);
    pointer('pointerup', 100 - 200);

    expect(ths[0].style.width).toBe('84px');
    expect(table.style.width).toBe('164px');
  });

  it('拖动表头右缘调整列宽并切到 fixed 布局', () => {
    const { container, table, ths } = renderTable([100, 80]);
    enhanceTables(container, 'tab-1');

    pointer('pointerdown', 100);
    pointer('pointermove', 130);
    pointer('pointerup', 130);

    expect(table.style.tableLayout).toBe('fixed');
    expect(ths[0].style.width).toBe('130px');
    expect(ths[1].style.width).toBe('80px');
    expect(table.style.width).toBe('210px');
  });

  it('重新渲染后恢复记住的列宽', () => {
    const first = renderTable([100, 80]);
    enhanceTables(first.container, 'tab-1');
    pointer('pointerdown', 100);
    pointer('pointermove', 130);
    pointer('pointerup', 130);

    const second = renderTable([300, 300]);
    enhanceTables(second.container, 'tab-1');
    expect(second.table.style.tableLayout).toBe('fixed');
    expect(second.table.style.width).toBe('210px');
  });

  it('双击分割线恢复自动列宽', () => {
    const { container, table } = renderTable([100, 80]);
    enhanceTables(container, 'tab-1');
    pointer('pointerdown', 100);
    pointer('pointermove', 130);
    pointer('pointerup', 130);

    document.querySelector('.table-col-resizer')!.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true }),
    );
    expect(table.style.tableLayout).toBe('');
    expect(table.style.width).toBe('');
  });
});
