# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

md++ (package name: `easy-md`) is a lightweight Markdown viewer and editor for Windows and macOS, built with Tauri v2 (Rust backend + React/TypeScript frontend). Licensed MIT, version 0.2.0.

## Commands

```bash
pnpm install              # Install dependencies
pnpm tauri dev            # Start dev server (Vite on port 14300 + Tauri backend)
pnpm dev                  # Frontend-only dev server
pnpm build                # Frontend build (tsc + vite)
pnpm test                 # Run frontend tests (vitest run)
pnpm test:watch           # Frontend tests in watch mode
pnpm test -- src/stores/tabsStore.test.ts  # Run single test file
cd src-tauri && cargo test  # Run Rust backend tests
pnpm tauri build          # Production build (MSI + NSIS installers)
```

First `pnpm tauri dev` compiles Rust dependencies (~5-10 min); subsequent starts are fast.

## CI/CD

- **CI** (`.github/workflows/ci.yml`) — push/PR to main 触发，跑前端测试 + 构建检查
- **Release** (`.github/workflows/release.yml`) — push `v*` tag 触发，自动构建安装包并创建 Draft Release
- Release 发布流程：改版本号 → `git tag v0.x.x` → `git push origin v0.x.x` → GitHub Actions 自动构建

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open file |
| `Ctrl+W` | Close current tab |
| `Ctrl+F` | Full-text search |
| `Ctrl+Shift+T` | Toggle light/dark theme |
| `Ctrl+P` | Print / export PDF |
| `Ctrl+Shift+C` | Copy rendered content |
| `Ctrl+Shift+R` | Toggle revision mode (track changes) |
| `Ctrl+E` | Toggle edit mode |

macOS will use `⌘` instead of `Ctrl`.

## Architecture

**Tauri v2 separation:** Rust backend handles only file I/O, file watching, and system integration. All rendering, UI, and business logic lives in the React frontend. Platform differences are isolated behind Rust `#[cfg(...)]` — the frontend has zero platform coupling.

### Backend (src-tauri/src/)

- `lib.rs` — Tauri Builder setup, plugin registration, CLI arg parsing, emits `open-on-startup` event
- `commands/files.rs` — `read_text_file`, `write_file`, `resolve_image` (local images → base64 data URLs)
- `commands/recent.rs` — `list_recent`/`add_recent` persisted to `recent.json` in app data dir
- `commands/opener.rs` — `open_containing_folder`, `check_file_association`, `register_file_association` (file association management)
- `watcher.rs` — `notify` crate with 300ms debounce, emits `file-changed` events to frontend

### Frontend (src/)

- `App.tsx` — Root layout orchestrator, wires hooks: `useOpenFile`, `useThemeInit`, `useGlobalShortcuts`, `useFileWatcher`, `useRevisionShortcuts`
- `stores/tabsStore.ts` — Core state: tab CRUD, active tab, scroll memory, file reading + rendering pipeline
- `stores/revisionStore.ts` — Revision mode state: track changes, navigate between diffs
- `features/markdown/render.ts` — Main rendering entry: markdown-it → shiki → mermaid → image resolution → DOM injection
- `features/export/export.ts` — Document export: PDF (via system print), HTML, Markdown
- `utils/diff.ts` — Line-level diff computation using `diff` package
- `ipc/` — Tauri command wrappers (`invoke` calls)

### Markdown Rendering Pipeline

```
Source → markdown-it (katex, task-lists, footnote, mark, linkify, emoji, containers, tabs)
      → shiki code highlighting
      → mermaid async rendering
      → image resolution (local paths → base64 via Rust)
      → DOM injection + post-processing (anchors, copy buttons, lightbox)
```

### Revision Mode

Revision mode allows users to track and navigate changes in markdown files:

- **Activation**: `Ctrl+Shift+R` or click the revision icon in TitleBar
- **State**: `revisionStore` manages revision history, current revision, and segment navigation
- **Diff computation**: `utils/diff.ts` uses the `diff` package for line-level diffing
- **Rendering**: `renderMarkdownWithHtml()` allows HTML comments for injecting highlight markers
- **Types**: `RevisionHunk`, `Revision` in `types/index.ts`
- **Navigation**: Navigate between change segments within and across revisions

### State Management (Zustand)

- `tabsStore` — Tab lifecycle, scroll memory, rendering, watcher sync
- `themeStore` — Light/dark/system theme, CSS variables via `data-theme` attribute
- `searchStore` — Full-text search keyword, visibility, match navigation
- `recentStore` — Recent files synced with Rust backend
- `revisionStore` — Revision mode: track changes, navigate between diffs
- `editStore` — Edit mode state management
- `zenStore` — Zen (distraction-free) mode state
- `customThemeStore` — Custom theme management

### Styling

- CSS variables for theming in `themes.css` (applied via `data-theme` on `<html>`)
- TailwindCSS for utilities (custom color tokens map to CSS vars)
- `prose.css` for GitHub-like markdown typography
- Responsive breakpoints at 768px and 600px

## Key Conventions

- **Package manager:** pnpm (v9+), not npm/yarn
- **Dev server port:** 14300 (avoids Windows reserved ports 1394-1493 for Hyper-V/WSL)
- **TypeScript types:** Shared types in `src/types/index.ts` (Tab, TocItem, RecentFile, ThemeMode, Revision, RevisionHunk)
- **IPC pattern:** All Tauri commands wrapped in `src/ipc/` files, never called raw from components
- **Test framework:** Vitest with jsdom; setup in `src/test/setup.ts`
- **Test location:** Co-located with source (`*.test.ts` next to implementation)
- **Git 提交注释：** 使用中文撰写 commit message（如 `feat: 添加文件拖拽支持`、`fix: 修复主题切换闪屏`）
- **作者：** leonan
- **仓库：** https://github.com/Gitleonan/easy-md

## Features

- **Multi-tab interface** — Open multiple markdown files in tabs
- **Edit mode** — Toggle with `Ctrl+E` to edit markdown source
- **Zen mode** — Distraction-free reading mode
- **Revision mode** — Track and navigate changes in documents
- **File association** — Register as default app for `.md`/`.markdown` files
- **Export** — PDF (via system print), HTML, and Markdown formats
- **Custom themes** — Create and manage custom color themes
- **Search** — Full-text search with match navigation
- **Table of Contents** — Sidebar TOC with active heading tracking
- **Lightbox** — Image preview with zoom
- **Syntax highlighting** — Shiki-based code highlighting with 100+ languages
- **Mermaid diagrams** — Render Mermaid flowcharts, sequence diagrams, etc.
- **KaTeX math** — LaTeX math expressions rendering
- **GitHub Alerts** — Support for `> [!NOTE]`, `> [!TIP]`, etc.
- **Task lists** — GitHub-style checkboxes
- **Footnotes** — Markdown footnote syntax
- **Emoji** — Shortcode emoji support (`:smile:` → 😄)

## Agent skills

### Issue tracker

Local markdown — issues live as files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.
