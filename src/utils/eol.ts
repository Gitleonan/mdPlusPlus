import { isMac } from './platform';

export type Eol = '\r\n' | '\n';

/**
 * 与 textarea 的换行归一化保持一致（HTML 规范：CRLF/CR → LF）。
 * ponytail: CR-only（classic Mac，已绝迹）文件保存后会被归一为 LF，textarea 本身也这么做；
 * 需要支持时在此检测裸 \r 并走 detectEol/restoreEol 链路。
 */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * 检测文本的主行尾风格：\r\n 与 \n 按多数派判定；
 * 无换行时沿用平台习惯（仅影响用户新增的行）。
 */
export function detectEol(source: string): Eol {
  const crlf = (source.match(/\r\n/g) ?? []).length;
  const lf = (source.match(/\n/g) ?? []).length;
  if (lf === 0) return isMac() ? '\n' : '\r\n';
  return crlf * 2 > lf ? '\r\n' : '\n';
}

/** 把 textarea 归一化出的 \n 还原为文件的原始行尾 */
export function restoreEol(text: string, eol: Eol): string {
  return eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}

/** 剥离前导 UTF-8 BOM：markdown-it 不剥 BOM，留着会让第一个标题解析失败 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
