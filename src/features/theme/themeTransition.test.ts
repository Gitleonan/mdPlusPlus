import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { withThemeTransition, withViewTransition } from './themeTransition';

function mockViewTransition() {
  return vi.fn((cb: () => void) => {
    cb();
    return { finished: Promise.resolve() } as ViewTransition;
  });
}

describe('withViewTransition', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
  });

  it('无 View Transitions 时降级为短暂的颜色过渡类', () => {
    vi.useFakeTimers();
    const update = vi.fn();

    withViewTransition(update);

    expect(update).toHaveBeenCalledTimes(1);
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(false);
  });

  it('支持 View Transitions 时冻结逐元素过渡并交给浏览器交叉淡化', async () => {
    const update = vi.fn();
    const startViewTransition = mockViewTransition();
    (document as unknown as { startViewTransition: typeof startViewTransition }).startViewTransition =
      startViewTransition;

    withThemeTransition(update);

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(document.documentElement.classList.contains('view-transitioning')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--vt-duration')).toBe('500ms');

    await Promise.resolve();
    expect(document.documentElement.classList.contains('view-transitioning')).toBe(false);
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(false);
  });

  it('用户偏好减少动效时直接切换', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
    })) as unknown as typeof window.matchMedia;

    const update = vi.fn();
    const startViewTransition = mockViewTransition();
    (document as unknown as { startViewTransition: typeof startViewTransition }).startViewTransition =
      startViewTransition;

    withViewTransition(update);

    expect(update).toHaveBeenCalledTimes(1);
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains('view-transitioning')).toBe(false);
    window.matchMedia = original;
  });
});
