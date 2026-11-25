import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const capability = JSON.parse(readFileSync('src-tauri/capabilities/default.json', 'utf8')) as {
  permissions: string[];
};

describe('tauri capabilities', () => {
  it('allows destroying the window used by onCloseRequested', () => {
    // @tauri-apps/api 的 onCloseRequested 在未 preventDefault 时会调用
    // window.destroy()；缺少这条权限会让正常关窗也被 ACL 拒绝。
    expect(capability.permissions).toContain('core:window:allow-destroy');
  });
});

describe('workflow pnpm version', () => {
  it('keeps CI and release on the version pinned by package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { packageManager: string };
    const pinned = pkg.packageManager.match(/^pnpm@([\d.]+)/)?.[1];
    expect(pinned).toBeTruthy();

    for (const file of ['.github/workflows/ci.yml', '.github/workflows/release.yml']) {
      const workflow = readFileSync(file, 'utf8');
      // pnpm 11 要求 Node >= 22.13；Node 20 会在官网 action 安装阶段直接失败。
      const nodeVersions = Array.from(
        workflow.matchAll(/node-version:\s*([\d.]+)/g),
        (m) => Number(m[1]),
      );
      expect(nodeVersions.length, `${file} should pin Node`).toBeGreaterThan(0);
      for (const version of nodeVersions) {
        expect(version, `${file} needs Node 22+ for pnpm 11`).toBeGreaterThanOrEqual(22);
      }

      // 只取 pnpm/action-setup 下的 version，别把 node-version 误当 pnpm 版本。
      // 未显式指定版本时 action 读取 package.json 的 packageManager，仍然锁定 pnpm。
      const versions = Array.from(
        workflow.matchAll(/pnpm\/action-setup@v4\s*\n\s*with:\s*\n\s*version:\s*([\d.]+)/g),
        (m) => m[1],
      );
      for (const version of versions) {
        // 旧 pnpm 读不了 lockfileVersion 9，打 tag 时会在安装阶段失败。
        expect(`${file}: pnpm ${version}`).toBe(`${file}: pnpm ${pinned}`);
      }
    }
  });
});
