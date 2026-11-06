import { describe, it, expect, beforeEach } from 'vitest';
import { useEphemeralStore } from './ephemeralStore';

const KEY = 'mdpp.ephemeralSession';

describe('ephemeralStore', () => {
  beforeEach(() => {
    useEphemeralStore.setState({ enabled: false });
    localStorage.clear();
  });

  it('开启即持久化偏好', () => {
    useEphemeralStore.getState().toggle();
    expect(useEphemeralStore.getState().enabled).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('1');
  });

  it('再关一次恢复关闭状态并落盘', () => {
    useEphemeralStore.getState().toggle();
    useEphemeralStore.getState().toggle();
    expect(useEphemeralStore.getState().enabled).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('0');
  });
});
