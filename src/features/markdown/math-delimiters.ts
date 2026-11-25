import type MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';

const BACKSLASH = 0x5c;
const OPEN_PAREN = 0x28;
const CLOSE_PAREN = 0x29;
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;

function isEscaped(source: string, pos: number): boolean {
  let escapes = 0;
  for (let i = pos - 1; i >= 0 && source[i] === '\\'; i--) escapes++;
  return escapes % 2 === 1;
}

/** ChatGPT / DeepSeek 网页版使用的 \(...\) 行内公式 */
function mathInlineParen(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const max = state.posMax;
  if (
    state.src.charCodeAt(start) !== BACKSLASH ||
    state.src.charCodeAt(start + 1) !== OPEN_PAREN ||
    isEscaped(state.src, start)
  ) {
    return false;
  }

  let close = start + 2;
  while (close + 1 < max) {
    if (
      state.src.charCodeAt(close) === BACKSLASH &&
      state.src.charCodeAt(close + 1) === CLOSE_PAREN &&
      !isEscaped(state.src, close)
    ) {
      break;
    }
    close++;
  }
  if (close + 1 >= max) return false;

  const content = state.src.slice(start + 2, close);
  if (!content.trim()) return false;

  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.markup = '\\(';
    token.content = content;
  }
  state.pos = close + 2;
  return true;
}

/** ChatGPT / DeepSeek 网页版使用的 \[...\] 块级公式 */
function mathBlockBracket(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const lineEnd = state.eMarks[startLine];
  if (
    state.src.charCodeAt(start) !== BACKSLASH ||
    state.src.charCodeAt(start + 1) !== OPEN_BRACKET ||
    isEscaped(state.src, start)
  ) {
    return false;
  }

  // 优先支持独占一行的围栏形式：
  // \[
  // E = mc^2
  // \]
  const afterOpen = state.src.slice(start + 2, lineEnd).trim();
  if (!afterOpen) {
    for (let next = startLine + 1; next < endLine; next++) {
      const pos = state.bMarks[next] + state.tShift[next];
      const max = state.eMarks[next];
      if (pos < max && state.tShift[next] < state.blkIndent) return false;
      if (state.src.slice(pos, max).trim() !== '\\]') continue;

      if (silent) return true;
      const content = state.getLines(startLine + 1, next, state.tShift[startLine], false);
      if (!content.trim()) return false;
      const token = state.push('math_block', 'math', 0);
      token.block = true;
      token.markup = '\\[';
      token.content = content;
      token.map = [startLine, next + 1];
      state.line = next + 1;
      return true;
    }
  }

  // 同一行写法：\[ E = mc^2 \]
  let close = start + 2;
  while (close + 1 < lineEnd) {
    if (
      state.src.charCodeAt(close) === BACKSLASH &&
      state.src.charCodeAt(close + 1) === CLOSE_BRACKET &&
      !isEscaped(state.src, close)
    ) {
      break;
    }
    close++;
  }
  if (close + 1 >= lineEnd) return false;
  if (state.src.slice(close + 2, lineEnd).trim()) return false;

  const content = state.src.slice(start + 2, close);
  if (!content.trim()) return false;
  if (silent) return true;

  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.markup = '\\[';
  token.content = content;
  token.map = [startLine, startLine + 1];
  state.line = startLine + 1;
  return true;
}

export function setupMathDelimiters(md: MarkdownIt): void {
  md.inline.ruler.before('escape', 'math_inline_paren', mathInlineParen);
  md.block.ruler.after('fence', 'math_block_bracket', mathBlockBracket, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
}
