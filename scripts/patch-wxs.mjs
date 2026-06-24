// patch-wxs.mjs — 修复 Tauri 生成的 main.wxs 桌面快捷方式图标
import { readFileSync, writeFileSync } from 'fs';

const wxsPath = process.argv[2];
if (!wxsPath) {
  console.error('Usage: node patch-wxs.mjs <path-to-main.wxs>');
  process.exit(1);
}

let content = readFileSync(wxsPath, 'utf8');

// 给桌面快捷方式添加 Icon="ProductIcon" 属性
// Tauri 生成的桌面快捷方式没有显式图标，依赖 exe 文件图标，
// 在某些 Windows 版本上会导致快捷方式图标显示为通用图标。
content = content.replace(
  /(<Shortcut\s+Id="ApplicationDesktopShortcut"[^>]*?)(\s*\/>)/,
  '$1 Icon="ProductIcon"$2'
);

writeFileSync(wxsPath, content);
console.log('  ✓ 桌面快捷方式图标已修复');
