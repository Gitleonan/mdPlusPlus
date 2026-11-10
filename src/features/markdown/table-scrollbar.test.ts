import { describe, it, expect, beforeEach } from 'vitest';
import { attachTableScrollbar } from './table-scrollbar';

function setupDom(scrollWidth = 600, clientWidth = 300) {
  document.body.innerHTML =
    '<div class="md-content"><div class="table-block"><div class="table-scroll"><table></table></div></div></div>';
  const scroll = document.querySelector<HTMLElement>('.table-scroll')!;
  Object.defineProperty(scroll, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(scroll, 'clientWidth', { configurable: true, value: clientWidth });
  attachTableScrollbar(scroll);
  const strip = scroll.previousElementSibling as HTMLElement;
  // jsdom 无布局：给轨道一个宽度
  Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 300 });
  return { scroll, strip, thumb: strip.querySelector<HTMLElement>('.table-hscroll-thumb')! };
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

describe('attachTableScrollbar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('滚动条插在表格最上方', () => {
    const { scroll, strip } = setupDom();
    expect(strip.className).toContain('table-hscroll');
    expect(strip.nextElementSibling).toBe(scroll);
    expect(strip.parentElement?.className).toBe('table-block');
  });

  it('无横向溢出时隐藏', async () => {
    const { scroll, strip } = setupDom(300, 300);
    scroll.dispatchEvent(new Event('scroll'));
    await nextFrame();
    expect(strip.classList.contains('is-hidden')).toBe(true);
  });

  it('有溢出时显示，滑块随横向滚动同步', async () => {
    const { scroll, strip, thumb } = setupDom(600, 300);
    scroll.dispatchEvent(new Event('scroll'));
    await nextFrame();

    expect(strip.classList.contains('is-hidden')).toBe(false);
    expect(thumb.style.width).toBe('150px'); // 300 * 300/600

    scroll.scrollLeft = 300;
    scroll.dispatchEvent(new Event('scroll'));
    await nextFrame();
    expect(thumb.style.transform).toBe('translateX(150px)'); // (300/300) * (300-150)
  });
});
