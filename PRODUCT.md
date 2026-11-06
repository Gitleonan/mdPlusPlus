# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

主用户(用户确认以此为准):Vibe Coding 场景下快速查阅 AI 生成文档(需求、架构设计、接口说明、PRD)的开发者,Windows 优先,双击 `.md` 即开即看。README 场景表确认的次要受众:技术文档阅读者(KaTeX/Mermaid/代码高亮)、多标签笔记浏览、文档变更追踪。

## Product Purpose

轻量、纯粹的 Markdown 阅读器(可快速编辑):双击文件即开即看,无需重型编辑器;v0.3 起监听文件外部修改、逐行 diff 可视化。成功 = 打开快、渲染全、内存占用低、看完即走不留痕迹。

## Positioning

双击即开的轻量阅读器 + 专业级的文件监听 diff 可视化;非 Electron(Tauri v2),低内存占用。明确不做重型编辑器——编辑模式是"需要时快速改一点",不是 IDE。

## Operating Context

- Windows 10 1809+(MSI/NSIS)+ macOS 11+(DMG);安装后注册 `.md`/`.markdown` 右键"用 md++ 打开"
- 打开入口:文件关联、拖拽、对话框、最近文件列表、会话恢复(现含无痕会话模式)
- 单实例逻辑:二次启动/访达双击转发到已运行实例
- 文件监听自动刷新外部修改(编辑模式下跳过)
- 临时看一眼的会话不应留下清理负担(无痕会话,dev 分支新增)

## Capabilities and Constraints

- 渲染管线纯前端:markdown-it → shiki → mermaid → 图片路径解析 → DOM 注入
- Rust 后端只做文件 IO/监听/系统集成/平台隔离(`#[cfg]`);前端零平台耦合
- 技术栈:Tauri v2 + React 18 + TS + zustand + lucide-react;pnpm;dev 端口 14300
- 能力:多标签(滚动/TOC 状态记忆)、全文搜索、编辑模式、Zen 模式、修订/监听 diff、导出 PDF/HTML/Markdown、自定义主题 CSS、TOC、Lightbox
- 明确未决:Linux/移动端不在路线图,未承诺

## Brand Commitments

- 名称 md++(仓库 mdPlusPlus),作者 leonan,MIT
- 视觉承诺(用户确认全部为硬约束,设计工作不得推翻):
  - 毛玻璃 UI(标题栏、搜索栏、字数统计等)
  - 内置主题体系(清新/午夜/学术 + 深浅主题)
  - Markdown 渲染排版对齐 vuepress-theme-plume(README 致谢已注明参考来源)
- 图标库 lucide-react

## Evidence on Hand

- `assets/github-promo.png`(宣传图)
- README.md / README_EN.md(产品事实主要来源)
- v0.1–v0.3 路线图均已发布,GitHub Releases 存在
- 无用户访谈或使用数据——后续工作不得伪造此类佐证

## Product Principles

1. **即开即看**:任何路径到达内容不超过一次双击;启动与交互零等待感
2. **轻量不拖沓**:非 Electron、低内存;拒绝长成第二编辑器
3. **变化可见**:文件被外部修改时,用户必须一眼看到改了什么
4. **不留痕迹的权利**:临时查看不制造清理负担
5. **平台差异不外泄**:前端零平台耦合,差异收在 Rust 层

## Accessibility & Inclusion

未建立明确标准(记录为未决;基础可访问性随实现保障)。
