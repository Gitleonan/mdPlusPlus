import { describe, it, expect, beforeEach } from 'vitest';
import { useEphemeralStore } from './ephemeralStore';
import { useToastStore } from './toastStore';
import { useTabsStore } from './tabsStore';

const KEY = 'mdpp.ephemeralSession';

describe('ephemeralStore', () => {
  beforeEach(() => {
    useEphemeralStore.setState({ enabled: false });
    useToastStore.setState({ toasts: [] });
    useTabsStore.setState({ tabs: [], activeTabId: null });
    localStorage.clear();
    document.documentElement.removeAttribute('data-ephemeral');
  });

  it('开启即持久化偏好并同步 <html> 属性', () => {
    useEphemeralStore.getState().toggle();
    expect(useEphemeralStore.getState().enabled).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('1');
    expect(document.documentElement.getAttribute('data-ephemeral')).toBe('true');
  });

  it('再关一次恢复关闭状态并落盘', () => {
    useEphemeralStore.getState().toggle();
    useEphemeralStore.getState().toggle();
    expect(useEphemeralStore.getState().enabled).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('0');
    expect(document.documentElement.getAttribute('data-ephemeral')).toBe('false');
  });

  it('开启时推送感知 toast,文案说明后果', () => {
    useEphemeralStore.getState().toggle();
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].message).toContain('不会被保留');
  });

  it('退出无痕时以当前 tab 集立即落盘(所见即所留)', () => {
    useTabsStore.setState({
      tabs: [
        { id: 't1', filePath: 'C:\\a.md', fileName: 'a.md', source: '', html: '', toc: [], scrollTop: 0, tocExpanded: {}, isLoading: false },
      ],
      activeTabId: 't1',
    });
    useEphemeralStore.getState().toggle(); // 开
    localStorage.removeItem(KEY);           // 开启期间不落盘,清掉以证明落盘来自退出动作
    useEphemeralStore.getState().toggle(); // 关
    const saved = JSON.parse(localStorage.getItem('mdpp.openTabs.v1') || '{}');
    expect(saved.paths).toEqual(['C:\\a.md']);
    expect(saved.activePath).toBe('C:\\a.md');
  });
});
