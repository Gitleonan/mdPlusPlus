import { describe, it, expect } from 'vitest';
import { useLayoutStore } from './layoutStore';

describe('layoutStore', () => {
  it('toggles between centered and full width, persisting the choice', () => {
    const before = useLayoutStore.getState().contentWidth;
    const next = before === 'full' ? 'centered' : 'full';

    useLayoutStore.getState().toggleContentWidth();

    expect(useLayoutStore.getState().contentWidth).toBe(next);
    expect(document.documentElement.getAttribute('data-content-width')).toBe(next);
    expect(localStorage.getItem('mdpp.contentWidth')).toBe(next);
  });

  it('resets manually sized tables so they re-flow to the new column width', () => {
    document.body.innerHTML = `
      <main class="md-content">
        <table data-md-resizable="true" style="table-layout: fixed; width: 300px">
          <thead><tr><th style="width: 300px">a</th></tr></thead>
        </table>
      </main>`;

    useLayoutStore.getState().toggleContentWidth();

    const table = document.querySelector('table')!;
    expect(table.style.tableLayout).toBe('');
    expect(table.style.width).toBe('');
    expect(table.querySelector('th')!.style.width).toBe('');
  });
});
