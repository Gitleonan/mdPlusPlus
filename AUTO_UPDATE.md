# 自动更新（GitHub 托管）

md++ 的版本更新检测完全托管在 GitHub Releases 上，不需要任何自建服务器。本文说明原理、一次性配置、日常发版流程，以及最容易踩的坑。

---

## 一、原理

应用启动约 3 秒后，会静默请求一个固定地址：

```
https://github.com/Gitleonan/mdPlusPlus/releases/latest/download/latest.json
```

这个文件由 CI 在打 tag 构建时自动生成并附加到 Release。应用比对其中的 `version` 与自身版本，发现更新就下载对应平台的安装包、校验签名、安装并重启。

`latest.json` 结构：

```json
{
  "version": "0.5.0",
  "pub_date": "2026-11-24T08:00:00Z",
  "platforms": {
    "darwin-aarch64": { "signature": "...", "url": "https://github.com/.../md++.app.tar.gz" },
    "darwin-x86_64":  { "signature": "...", "url": "https://github.com/.../md++.app.tar.gz" },
    "windows-x86_64": { "signature": "...", "url": "https://github.com/.../md++_x64-setup.exe" }
  }
}
```

关键点：`/releases/latest/` 只解析**已发布**（非 Draft、非预发布）的最新 Release。所以更新只在人工点 Publish 之后才对用户生效。

相关代码：

| 位置 | 作用 |
| --- | --- |
| `src-tauri/tauri.conf.json` → `plugins.updater` | endpoint 与公钥 |
| `src-tauri/tauri.conf.json` → `bundle.createUpdaterArtifacts` | 产出可更新的安装包与 `.sig` |
| `src/ipc/updater.ts` | `check()` / `downloadAndInstall()` 封装 |
| `src/stores/updateStore.ts` | 状态机（检查/下载/安装/错误） |
| `src/hooks/useUpdater.ts` | 启动静默检查（6 小时一次）+ 手动检查 |
| `src/components/UpdateDialog/` | 更新弹窗 |
| `src/components/TitleBar/TitleBar.tsx` | 标题栏「vX.Y.Z」更新胶囊 |
| `.github/workflows/release.yml` | 签名、构建、上传 latest.json |

---

## 二、一次性配置（三步，做完永久有效）

### 1. 生成签名密钥对

**只需生成一次，两台电脑共用同一把。** 这不是「每台机器一把钥匙」——公钥会被编译进每个用户的程序里，用来校验更新包；私钥只在 CI 里给宝宝签名。随便哪台电脑生成都行，但生成后必须备份。

在任意一台装有 Rust 工具链的电脑上执行：

```bash
cd src-tauri
cargo install tauri-cli --version "^2" --locked   # 只需一次
cd ..
pnpm tauri signer generate -w ~/.tauri/mdpp.key
```

命令会输出：

- **公钥**（Public key）—— 一串 `dW50cnVzdGVkIGNvbW1lbnQ6...` 开头的 base64
- **私钥**（Private key）—— 写在 `~/.tauri/mdpp.key` 文件里
- 如果没加 `--password`，会提示设置一个密码，也可留空

> ⚠️ **私钥一旦永久丢失，已发布的旧版本就再也无法自动更新了**（客户端里写死的公钥只认这一把）。请把 `~/.tauri/mdpp.key` 和密码存进密码管理器，并在第二台电脑上另存一份。

### 2. 填公钥到项目里

把生成的**公钥**内容填进 [tauri.conf.json](src-tauri/tauri.conf.json)：

```json
"plugins": {
  "updater": {
    "endpoints": ["https://github.com/Gitleonan/mdPlusPlus/releases/latest/download/latest.json"],
    "pubkey": "这里粘贴公钥",          // ← 替换掉空字符串
    "windows": { "installMode": "passive" }
  }
}
```

公钥不是路径，必须是密钥内容本身。

### 3. 配置 GitHub Secrets

仓库 → **Settings → Secrets and variables → Actions → New repository secret**，添加两个：

| Secret 名称 | 值 |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | `~/.tauri/mdpp.key` 文件的**完整内容** |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 生成时设置的密码（没设密码就留空） |

---

## 三、日常发版流程

```bash
# 1. 改版本号（只改 package.json，其余由脚本同步）
#    - package.json  "version": "0.5.0"

# 2. 同步到 Cargo.toml / tauri.conf.json / AboutModal
node scripts/sync-version.mjs

# 3. 提交并打 tag
git add -A
git commit -m "chore: bump version to 0.5.0"
git push origin main
git tag v0.5.0
git push origin v0.5.0
```

CI 随后：

1. **Windows** job 构建 NSIS 安装包，上传 `.exe` + `.exe.sig` + `latest.json`（Draft Release）
2. **macOS** job 等 Windows 完成后，构建 Universal（Apple Silicon + Intel）包，同样上传并**合并**进 `latest.json`
3. 你在 GitHub 上审阅 Draft Release → 点 **Publish release**

**只有 Publish 之后，用户才会收到更新提示。** 这是有意为之：让你能先检查构建产物再放量。

---

## 四、注意事项（都是真实会踩的坑）

### 版本号必须严格递增

更新判定是语义化版本比较。同一个版本号重复发布不会触发更新；版本号回退也不会。

### 本地 `pnpm tauri build` 会因缺少私钥而失败

`createUpdaterArtifacts: true` 之后，本地构建需要私钥才能签名。两种做法：

```bash
# 做法一：临时导出（当前终端有效）
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/mdpp.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="你的密码"
pnpm tauri build
```

```bash
# 做法二：直接交给 CI 构建，本地只跑 pnpm tauri dev
```

`tauri build` **不接受** `.env` 文件里的变量，必须是真实的环境变量。

### 两个平台的 job 必须串行

`tauri-action` 生成 `latest.json` 的逻辑是「读取 Release 上已有的文件 → 合并 `platforms` → 回写」。两个 job 并行时会读到彼此还没写完的状态，可能丢失一个平台的条目。所以 `release.yml` 里 macOS job 声明了 `needs: release-windows`。

如果你以后加 Linux，也要继续串在这条链上。

### macOS 必须是 Universal 构建

`macos-latest` 是 Apple Silicon 机器。只做默认构建的话，`latest.json` 里只有 `darwin-aarch64`，Intel Mac 用户永远收不到更新。CI 里已经用 `--target universal-apple-darwin` 解决，`tauri-action` 会把 Universal 包展开成 `darwin-aarch64` + `darwin-x86_64` 两个条目。

### Windows 上的 MSI 不参与自动更新

`bundle.targets` 只出 `nsis`（不出 `msi`），所以自动更新走 NSIS 静默安装（`installMode: "passive"`，会显示一个小进度窗）。Release 页面上的 MSI 是给企业部署用的，装了 MSI 的用户拿不到应用内更新。

### 签名校验失败会中止安装

如果用户下载的包和 `latest.json` 里的 `signature` 不匹配（比如中途被代理篡改），安装会中止并提示「更新包签名校验失败」。这是预期行为，不要绕过。

### 国内网络

`latest.json` 和安装包都走 GitHub Releases 的 CDN，通常可用但不稳定。若日后需要优化，可选：把 `latest.json` 与安装包同步镜像到 jsDelivr，或在 `plugins.updater.endpoints` 里再加一个镜像地址（Tauri 只会在非 2XX 时才尝试下一个 endpoint，网络超时不会自动回退）。这仍然不需要自建服务器。

---

## 五、测试清单

首次配置完成后，按顺序验证：

- [ ] `pnpm tauri dev` 能正常启动，关于窗口显示正确版本
- [ ] 关于窗口 →「检查更新」→ 显示「已是最新版本」（即 endpoint 可达、pubkey 有效）
- [ ] 发布一个 `0.4.2` 并 Publish → 用 `0.4.1` 安装版启动 → 3 秒后标题栏出现 `v0.4.2` 胶囊 → 点开弹窗 → 立即更新 → 下载进度 → 自动重启
- [ ] 重启后关于窗口显示 `0.4.2`
- [ ] Windows 与 macOS 各测一遍

---

## 六、密钥问题速查

| 问题 | 答案 |
| --- | --- |
| 哪台电脑生成？ | 任意一台，只生成一次 |
| 两台电脑要各生成一把吗？ | **不要**，会互相打架 |
| 以后换电脑发版还能用吗？ | 能，用的是 GitHub Secrets 里那把 |
| 私钥丢了怎么办？ | 已发布的旧版本永久失去自动更新能力，只能让用户手动下载新版；新版可换新密钥 |
| 私钥能提交到仓库吗？ | 绝对不能 |
| 公钥泄露有风险吗？ | 没有，公钥本来就是公开的 |
