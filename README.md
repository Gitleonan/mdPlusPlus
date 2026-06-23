# md++ — 轻量 Markdown 阅读器

> **md++** (easy-md) — 快速、轻量的 Markdown 阅读器，支持 Windows & macOS。双击 `.md` 即开即看，无需重型编辑器。内置文件监听模式，实时捕获外部修改并可视化展示内容变更。

> 🌐 [English Version](./README_EN.md)

[![made with Tauri](https://img.shields.io/badge/made%20with-Tauri%20v2-orange)](https://tauri.app)
[![React](https://img.shields.io/badge/frontend-React%2018%20%2B%20TS-blue)](https://react.dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/Gitleonan/easy-md)](https://github.com/Gitleonan/easy-md/releases)
[![GitHub Stars](https://img.shields.io/github/stars/Gitleonan/easy-md?style=social)](https://github.com/Gitleonan/easy-md)

---
![md++ 软件界面介绍图](assets/github-promo.png)

---

## 🤔 为什么做这个

Windows 下一直没有好用的 Markdown 预览工具。想快速看一眼 `.md` 文件的内容，要么得打开 VS Code 这样的重量级编辑器，要么得用浏览器配合插件，体验都不够便捷。

**md++** 就是为了解决这个问题——一个轻量、纯粹的 Markdown 阅读器，双击文件即可预览，需要时也能快速编辑。**v0.3 新增的监听模式**，能像专业 diff 工具一样监听文件的外部变化、自动计算差异并可视化展示变更内容。

[📥 下载](https://github.com/Gitleonan/easy-md/releases) · [🐛 报告问题](https://github.com/Gitleonan/easy-md/issues) · [💬 讨论](https://github.com/Gitleonan/easy-md/discussions)

### ✨ 特性

#### 阅读体验
- 🎨 **全语法渲染** — 标准 Markdown + KaTeX 数学公式 + shiki 代码高亮 + Mermaid 图表
- 📑 **双栏 TOC** — 左侧目录树，点击跳转，滚动联动高亮，支持搜索过滤
- 🖼️ **图片增强** — 相对/绝对/网络图片，点击 Lightbox 放大，支持缩放（`+` / `-`）
- 📝 **代码块增强** — 行号、语言标签、一键复制
- 💡 **GitHub 风格** — NOTE / TIP / WARNING / CAUTION 警报块 + `:::` 自定义容器
- 🔗 **智能链接** — 外链用系统浏览器打开，`.md` 链接自动在新标签页打开

#### 监听模式（新功能 🆕）
- 🔍 **文件监听** — `Ctrl+Shift+R` 开启监听，自动监控当前文件的外部变化
- 🟢 **新增行** — 绿色文字 + 浅绿背景 + 绿色左边框，一目了然
- 🔴 **删除行** — 红色文字 + 删除线 + 浅红背景 + 红色左边框，清晰标注
- 🧭 **逐条浏览** — 「上一个」「下一个」按钮逐条浏览变更，浮动工具栏显示「变更 1/3」
- 📊 **变更摘要** — 底部悬浮胶囊实时显示「+5 行新增  -2 行删除」
- 🔄 **自动捕获** — 文件监听器自动捕获外部修改，计算逐行差异并记录变更历史
- 🫧 **活跃指示器** — 呼吸光点 + 毛玻璃胶囊，直观展示监听状态与变更统计

#### 效率工具
- 🗂️ **多标签页** — 浏览器风格标签栏，拖拽排序，独立记忆滚动位置与目录状态
- 🔍 **全文搜索** — `Ctrl+F` 浮动搜索栏，高亮所有匹配，上下导航
- ✏️ **快速编辑** — `Ctrl+E` 切换编辑模式，语法着色，`Ctrl+S` 保存
- 📤 **多格式导出** — PDF / HTML / Markdown 原文件
- 🔄 **文件监听** — 外部修改自动刷新，编辑模式下自动跳过
- 🚀 **多入口** — 右键关联 / 拖拽 / 文件对话框 / 最近文件列表
- 💾 **会话恢复** — 重启后自动恢复上次打开的所有标签

#### 界面与主题
- 🌗 **深浅主题** — 浅色 / 深色 / 跟随系统，一键切换（`Ctrl+Shift+T`）
- 🎨 **自定义主题** — 导入 CSS 文件自定义正文样式，内置「清新」「午夜」「学术」三套主题
- 🧘 **Zen 专注模式** — `Ctrl+Shift+Z` 进入，隐藏所有 UI 仅显示内容，`ESC` 退出
- 🪟 **毛玻璃 UI** — 标题栏、搜索栏、字数统计等采用毛玻璃模糊效果
- 🔝 **平滑滚动** — 回到顶部 / TOC 跳转 / 搜索导航均带缓动动画

#### 跨平台
- 🍎 平台差异隔离在 Rust 层，前端零耦合，Windows / macOS 均已适配

### ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+O` | 打开文件 |
| `Ctrl+F` | 全文搜索 |
| `Ctrl+E` | 切换编辑 / 预览模式 |
| `Ctrl+S` | 保存（编辑模式） |
| `Ctrl+P` | 导出 |
| `Ctrl+Shift+R` | 切换文件监听模式 |
| `Ctrl+Shift+T` | 切换深浅主题 |
| `Ctrl+Shift+Z` | 进入 / 退出 Zen 专注模式 |
| `ESC` | 关闭搜索 / 退出 Zen 模式 / 关闭灯箱 |

> macOS 使用 `⌘` 替代 `Ctrl`。

### 📦 下载安装

前往 [Releases](https://github.com/Gitleonan/easy-md/releases) 下载对应平台的安装包：

| 平台 | 格式 | 系统要求 |
|------|------|----------|
| Windows | `.msi` | Windows 10 1809+（需 WebView2 运行时，Win11 默认自带） |
| macOS | `.dmg` | macOS 11.0+ (Big Sur) |

安装后可自动注册 `.md` / `.markdown` 文件的右键菜单 **"用 md++ 打开"**

### 🏗️ 架构

```
Tauri v2 (Rust)  ── 文件 IO / 文件监听 / 系统集成 / 平台隔离
       ↕ Tauri Command 契约
React 18 + TS    ── 渲染管线 / UI / 状态管理 / 业务逻辑
```

- **Rust 后端**只做前端做不了的事（文件系统、监听、系统集成）
- **前端**完全平台无关，所有平台差异由 Rust `#[cfg(...)]` 隔离
- **渲染管线**纯前端：`markdown-it` → `shiki` → `mermaid` → 图片路径解析
- **状态管理**：zustand（tabsStore / editStore / themeStore / zenStore / searchStore / revisionStore）
- **图标库**：lucide-react（按需导入，最小打包）

### 🔎 适用场景

| 场景 | 说明 |
|------|------|
| **Markdown 快速预览** | 双击 `.md` 文件即开即看，无需启动 IDE |
| **Typora 替代品** | 免费、开源、轻量的 Markdown 阅读器 |
| **Windows Markdown 查看器** | 原生 Windows 应用，非 Electron，内存占用低 |
| **macOS Markdown 阅读器** | 原生 macOS 适配，支持 `.dmg` 安装 |
| **技术文档阅读** | KaTeX 数学公式 + Mermaid 图表 + 代码高亮 |
| **笔记浏览** | 多标签页、目录导航、全文搜索 |
| **文档变更追踪** | 监听文件外部变化，差异可视化对比 |

### 🗺️ 路线图

- [x] v0.1 — Windows 首发，完整阅读功能
- [x] v0.2 — 编辑模式 / 自定义主题 / Zen 专注模式 / macOS 适配
- [x] v0.3 — 文件监听模式（逐行差异对比、变更导航、实时指示器）

### 🛠️ 开发

**前置环境**

| 工具 | 版本 | 说明 |
|------|------|------|
| Node.js | ≥ 20 | 前端构建 |
| pnpm | ≥ 9 | 包管理（`npm i -g pnpm`） |
| Rust | stable | Tauri 后端编译（[安装](https://www.rust-lang.org/tools/install)） |
| Git | ≥ 2.30 | 版本控制 |

**启动开发**

```bash
git clone https://github.com/Gitleonan/easy-md.git
cd easy-md
pnpm install
pnpm tauri dev
```

首次启动会编译 Rust 依赖（约 5-10 分钟），之后启动很快。

**运行测试**

```bash
pnpm test          # 前端单元测试（Vitest）
cd src-tauri && cargo test   # 后端 Rust 测试
```

**构建安装包**

```bash
pnpm tauri build
```

产物位于 `src-tauri/target/release/bundle/`：
- **Windows** — `.msi` 安装包
- **macOS** — `.dmg` 磁盘映像

---

## 🙏 致谢

本项目 Markdown 渲染方案参考了 [vuepress-theme-plume](https://github.com/pengzhanbo/vuepress-theme-plume) 项目，特此感谢。

---

## 📄 License

MIT

---

**Keywords**: markdown viewer, markdown reader, markdown preview, windows markdown, macos markdown, tauri app, open source, lightweight, multi-tab, pdf export, code highlight, katex, mermaid, file monitoring, change diff, line diff, markdown-it, react, zustand
