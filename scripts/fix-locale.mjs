// fix-locale.mjs — 修复 WiX locale.wxl 的 codepage 为 936（支持中文 GBK）
import { readFileSync, writeFileSync } from 'fs';

const wxlPath = process.argv[2];
if (!wxlPath) {
  console.error('Usage: node fix-locale.mjs <path-to-locale.wxl>');
  process.exit(1);
}

let content = readFileSync(wxlPath, 'utf8');

// 1. Set Codepage attribute on <WixLocalization> root element
content = content.replace(
  /(<WixLocalization\s+[^>]*?)>/,
  (match, before) => {
    if (before.includes('Codepage=')) {
      // Update existing Codepage
      return before.replace(/Codepage="\d+"/, 'Codepage="936"') + '>';
    }
    return before + ' Codepage="936">';
  }
);

// 2. Set TauriCodepage string value
content = content.replace(
  /<String Id="TauriCodepage">\d+<\/String>/,
  '<String Id="TauriCodepage">936</String>'
);

writeFileSync(wxlPath, content);
console.log('  ✓ Locale codepage set to 936');
