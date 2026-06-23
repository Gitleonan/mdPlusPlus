# md++ — Lightweight Markdown Viewer

> **md++** (easy-md) — A fast, lightweight Markdown viewer and reader for Windows & macOS. Open `.md` files instantly — no heavy editors needed. Built-in file monitoring mode captures external changes and visualizes content diffs in real time.

> 🌐 [中文版本](./README.md)

[![made with Tauri](https://img.shields.io/badge/made%20with-Tauri%20v2-orange)](https://tauri.app)
[![React](https://img.shields.io/badge/frontend-React%2018%20%2B%20TS-blue)](https://react.dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/Gitleonan/easy-md)](https://github.com/Gitleonan/easy-md/releases)
[![GitHub Stars](https://img.shields.io/github/stars/Gitleonan/easy-md?style=social)](https://github.com/Gitleonan/easy-md)

---
![md++ Software Interface](assets/github-promo.png)

---

**md++** is a fast, lightweight **Markdown viewer and reader** built with [Tauri v2](https://tauri.app) (Rust + React). Open `.md` files instantly on **Windows** or **macOS** — no heavy editors needed.

In the era of **Vibe Coding**, AI-generated code is everywhere — and so are `.md` files: requirements documents, architecture designs, API specs, PRDs. You need to check them constantly, but launching VS Code or a browser every time is overkill. **md++** fills that gap — a distraction-free Markdown viewer that stays out of your way.

**Highlights:** Full Markdown rendering (KaTeX math, Mermaid diagrams, shiki code highlighting), multi-tab browsing, TOC navigation, full-text search, PDF/HTML export, dark/light themes, file-watching auto-reload, Zen focus mode, and **file monitoring** — watch external file changes and visualize content diffs in real time.

[📥 Download](https://github.com/Gitleonan/easy-md/releases) · [🐛 Report Issue](https://github.com/Gitleonan/easy-md/issues) · [💬 Discussions](https://github.com/Gitleonan/easy-md/discussions)

### ✨ Features

#### Reading Experience
- 🎨 **Full syntax rendering** — Standard Markdown + KaTeX math + shiki code highlighting + Mermaid diagrams
- 📑 **Sidebar TOC** — Auto-generated table of contents with scroll sync and search filter
- 🖼️ **Image enhancement** — Relative/absolute/remote images, click-to-zoom lightbox with scaling
- 📝 **Code block enhancement** — Line numbers, language labels, one-click copy
- 💡 **GitHub-flavored** — Alerts (NOTE / TIP / WARNING / CAUTION) + `:::` custom containers
- 🔗 **Smart links** — External links open in system browser, `.md` links open in new tab

#### File Monitoring & Change Diff (New! 🆕)
- 🔍 **File monitoring** — `Ctrl+Shift+R` starts monitoring the current file for external changes
- 🟢 **Added lines** — Displayed in green with a subtle green left border
- 🔴 **Deleted lines** — Displayed in red with strikethrough and a red left border
- 🧭 **Change navigation** — Browse detected changes one by one with Previous / Next buttons
- 📊 **Change summary** — View counts of added and deleted lines at a glance
- 🔄 **Auto-capture** — File watcher automatically captures external modifications and computes line-level diffs
- 🫧 **Live indicator** — A pulsing "monitoring" badge shows the active monitoring state and current change stats

#### Productivity
- 🗂️ **Multi-tab** — Browser-style tabs with drag-to-reorder; each tab remembers its scroll position
- 🔍 **Full-text search** — `Ctrl+F` floating search bar; highlights all matches with up/down navigation
- ✏️ **Quick editing** — `Ctrl+E` toggles edit mode with syntax highlighting; `Ctrl+S` to save
- 📤 **Multi-format export** — Export to PDF, standalone HTML, or raw Markdown
- 🔄 **File watching** — Auto-reloads when external tools modify the file (skips during editing)
- 🚀 **Multiple entry points** — Right-click association / drag-and-drop / file dialog / recent files
- 💾 **Session restore** — Reopens all tabs from last session after restart

#### UI & Themes
- 🌗 **Dark & Light** — Light / Dark / System themes; one-key toggle (`Ctrl+Shift+T`)
- 🎨 **Custom themes** — Import CSS files; includes "Fresh", "Midnight", and "Academic" presets
- 🧘 **Zen mode** — `Ctrl+Shift+Z` hides all UI, showing only content; `ESC` to exit
- 🪟 **Glass-morphism UI** — Frosted-glass effect on title bar, search bar, and badges
- 🔝 **Smooth scrolling** — Eased animations for back-to-top, TOC jumps, and search navigation

#### Cross-platform
- 🍎 Platform-specific logic isolated in Rust layer; zero coupling in frontend
- 🪟 Windows 10 1809+ (WebView2 required; built-in on Win11)
- 🍎 macOS 11.0+ (Big Sur)

### ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open file |
| `Ctrl+F` | Full-text search |
| `Ctrl+E` | Toggle edit / preview mode |
| `Ctrl+S` | Save (edit mode) |
| `Ctrl+P` | Export |
| `Ctrl+Shift+R` | Toggle file monitoring mode |
| `Ctrl+Shift+T` | Toggle dark/light theme |
| `Ctrl+Shift+Z` | Toggle Zen mode |
| `ESC` | Close search / exit Zen / close lightbox |

> On macOS, use `⌘` (Cmd) instead of `Ctrl`.

### 🏗️ Architecture

```
Tauri v2 (Rust)  ── File I/O / File watching / System integration / Platform isolation
       ↕ Tauri Command contract
React 18 + TS    ── Render pipeline / UI / State management / Business logic
```

- **Rust backend** handles what the frontend can't: file system, file watching, system integration
- **Frontend** is fully platform-agnostic; all platform differences are abstracted by Rust `#[cfg(...)]`
- **Render pipeline**: `markdown-it` → `shiki` → `mermaid` → image path resolution
- **State management**: zustand (tabs / edit / theme / zen / search / revision stores)
- **Icons**: lucide-react (tree-shaken, minimal bundle)

### 🔎 Use Cases

| Scenario | Description |
|----------|-------------|
| **Quick Markdown preview** | Double-click `.md` files — no IDE required |
| **Vibe Coding companion** | Browse AI-generated requirements, architecture docs, and PRDs on the fly |
| **Windows Markdown viewer** | Native Windows app (not Electron); low memory footprint |
| **macOS Markdown reader** | Native macOS support with `.dmg` installation |
| **Technical docs** | KaTeX math + Mermaid diagrams + syntax-highlighted code |
| **Note browsing** | Multi-tab, TOC navigation, full-text search |
| **File monitoring** | Watch external file changes and visualize content diffs |

### 🗺️ Roadmap

- [x] v0.1 — Windows launch, complete reading features
- [x] v0.2 — Edit mode / Custom themes / Zen mode / macOS support
- [x] v0.3 — File monitoring & change diff (line-level diff, change navigation, live indicator)

### 🛠️ Development

**Prerequisites**

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 20 | Frontend build |
| pnpm | ≥ 9 | Package manager (`npm i -g pnpm`) |
| Rust | stable | Tauri backend ([install](https://www.rust-lang.org/tools/install)) |
| Git | ≥ 2.30 | Version control |

**Quick start**

```bash
git clone https://github.com/Gitleonan/easy-md.git
cd easy-md
pnpm install
pnpm tauri dev
```

First run compiles Rust dependencies (~5–10 min); subsequent starts are fast.

**Running tests**

```bash
pnpm test                  # Frontend unit tests (Vitest)
cd src-tauri && cargo test # Backend Rust tests
```

**Building installers**

```bash
pnpm tauri build
```

Outputs are in `src-tauri/target/release/bundle/`:
- **Windows** — `.msi` installer
- **macOS** — `.dmg` disk image

---

## 🙏 Acknowledgments

The Markdown rendering approach in this project was inspired by [vuepress-theme-plume](https://github.com/pengzhanbo/vuepress-theme-plume). Many thanks to the author.

---

## 📄 License

MIT

---

**Keywords**: markdown viewer, markdown reader, markdown preview, windows markdown, macos markdown, tauri app, open source, lightweight, multi-tab, pdf export, code highlight, katex, mermaid, file monitoring, change diff, line diff, markdown-it, react, zustand
