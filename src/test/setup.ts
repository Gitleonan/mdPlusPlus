import '@testing-library/jest-dom/vitest';

/**
 * 本机 Node 26 + vitest 2.1 + jsdom 25 的组合下，jsdom 环境没有注入 localStorage，
 * 而多个 store 在模块初始化时就会读取它，导致整批判测试在导入阶段就崩。
 * 这里补一个内存实现：只在测试里生效，不影响运行时。
 */
if (typeof globalThis.localStorage === 'undefined') {
  class MemoryStorage implements Storage {
    private store = new Map<string, string>();

    get length() {
      return this.store.size;
    }

    clear() {
      this.store.clear();
    }

    getItem(key: string) {
      return this.store.has(key) ? this.store.get(key)! : null;
    }

    key(index: number) {
      return Array.from(this.store.keys())[index] ?? null;
    }

    removeItem(key: string) {
      this.store.delete(key);
    }

    setItem(key: string, value: string) {
      this.store.set(key, String(value));
    }
  }

  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
  });
}
