/**
 * 表格列宽手动调整。
 *
 * 默认保持浏览器自动列宽；拖动表头右缘后切换为 fixed 布局，
 * 双击表头分割线恢复自动列宽。列宽按文档 + 表格序号记在内存中，
 * 重新渲染（编辑/主题/修订切换）后自动恢复。
 */

import { attachTableScrollbar } from './table-scrollbar';

/** 与 CSS 中 th/td 的 min-width: 6em（14px 字号 ≈ 84px）保持一致 */
const MIN_COL_WIDTH = 84;
const savedWidths = new Map<string, number[]>();

function headerCells(table: HTMLTableElement): HTMLTableCellElement[] {
  const row = table.querySelector('tr');
  return row ? (Array.from(row.children) as HTMLTableCellElement[]) : [];
}

function applyWidths(table: HTMLTableElement, widths: number[]): boolean {
  const cells = headerCells(table);
  if (widths.length !== cells.length || !widths.every((w) => w > 0)) return false;
  table.style.tableLayout = 'fixed';
  table.style.width = `${widths.reduce((sum, w) => sum + w, 0)}px`;
  cells.forEach((cell, i) => { cell.style.width = `${widths[i]}px`; });
  return true;
}

function clearWidths(table: HTMLTableElement): void {
  table.style.tableLayout = '';
  table.style.width = '';
  headerCells(table).forEach((cell) => { cell.style.width = ''; });
}

export function enhanceTables(container: HTMLElement, docKey = ''): void {
  const tables = Array.from(container.querySelectorAll<HTMLTableElement>('table'));
  tables.forEach((table, index) => {
    if (table.dataset.mdResizable === 'true') return;
    const cells = headerCells(table);
    if (!cells.length) return;
    table.dataset.mdResizable = 'true';

    // 横向滚动容器：table 保持真实 table 布局，列宽才可控且不会溢出正文栏。
    // .table-block 只负责把横向滚动条和表格绑在一起（sticky 不越界到下一段内容）。
    if (!table.closest('.table-block')) {
      const block = document.createElement('div');
      block.className = 'table-block';
      table.replaceWith(block);
      const scroll = document.createElement('div');
      scroll.className = 'table-scroll';
      block.appendChild(scroll);
      scroll.appendChild(table);
      attachTableScrollbar(scroll);
    }

    const key = `${docKey}#${index}`;
    const saved = savedWidths.get(key);
    if (saved) applyWidths(table, saved);

    cells.forEach((cell, col) => {
      const handle = document.createElement('span');
      handle.className = 'table-col-resizer';
      handle.setAttribute('aria-hidden', 'true');
      cell.appendChild(handle);

      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const widths = cells.map((c) => c.getBoundingClientRect().width);
        // 未布局（如 jsdom / 隐藏状态）时不进入拖拽
        if (!widths.some((w) => w > 0)) return;
        if (!applyWidths(table, widths)) return;

        const startX = event.clientX;
        document.body.classList.add('is-col-resizing');

        const onMove = (move: PointerEvent) => {
          const width = Math.max(MIN_COL_WIDTH, widths[col] + move.clientX - startX);
          cells[col].style.width = `${width}px`;
          table.style.width = `${widths.reduce((sum, w, i) => sum + (i === col ? width : w), 0)}px`;
        };
        const onUp = () => {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          document.body.classList.remove('is-col-resizing');
          savedWidths.set(key, cells.map((c) => c.getBoundingClientRect().width));
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });

      // 双击分割线：恢复自动列宽
      handle.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
        savedWidths.delete(key);
        clearWidths(table);
      });
    });
  });
}

/** 仅测试用：清空记忆的列宽 */
export function resetSavedTableWidths(): void {
  savedWidths.clear();
}

/** 回到自动列宽：布局宽度变化后重新按新栏宽排版 */
export function resetTableWidths(): void {
  savedWidths.clear();
  document
    .querySelectorAll<HTMLTableElement>('table[data-md-resizable="true"]')
    .forEach(clearWidths);
}
