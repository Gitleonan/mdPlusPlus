import MarkdownIt from 'markdown-it';
import katex from '@traptitech/markdown-it-katex';
import taskLists from 'markdown-it-task-lists';
import footnote from 'markdown-it-footnote';
import mark from 'markdown-it-mark';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import { full as emoji } from 'markdown-it-emoji';
import abbr from 'markdown-it-abbr';
import container from 'markdown-it-container';
import { setupGitHubAlerts } from './github-alerts';
import { setupCodeBlockTitle } from './code-features';

const EXTERNAL_PROTO = /^(https?|ftp|mailto|tel):/i;
const MD_EXT = /\.(md|markdown)(\?|#|$)/i;

/** 给 <a> 加上分类 class，便于样式区分 + 点击拦截。 */
function tagLinks(md: MarkdownIt): void {
  const defaultRender =
    md.renderer.rules.link_open ||
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const href = token.attrGet('href') ?? '';
    if (EXTERNAL_PROTO.test(href)) {
      token.attrJoin('class', 'md-link-external');
      token.attrSet('rel', 'noopener noreferrer');
    } else if (href.startsWith('#')) {
      token.attrJoin('class', 'md-link-anchor');
    } else if (MD_EXT.test(href)) {
      token.attrJoin('class', 'md-link-md');
    } else if (href) {
      token.attrJoin('class', 'md-link-local');
    }
    return defaultRender(tokens, idx, options, env, self);
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TokenLike = any;

/** note/info/tip/warning/caution 容器渲染 — 图标由 CSS ::before SVG 提供 */
function containerRender(type: string): (tokens: TokenLike[], idx: number) => string {
  return (tokens, idx) => {
    const token = tokens[idx];
    if (token.nesting === 1) {
      const info = token.info.trim().slice(type.length).trim();
      const title = info || type.charAt(0).toUpperCase() + type.slice(1);
      return `<div class="md-container md-container-${type}"><p class="md-container-title">${title}</p>\n`;
    }
    return '</div>\n';
  };
}

/** details 折叠容器渲染 */
function detailsRender(tokens: TokenLike[], idx: number): string {
  const token = tokens[idx];
  if (token.nesting === 1) {
    const info = token.info.trim().slice('details'.length).trim();
    const title = info || 'Details';
    return `<details class="md-details"><summary class="md-details-summary">${title}</summary>\n`;
  }
  return '</details>\n';
}

/** tabs 容器渲染 */
function tabsContainerOpen(tokens: TokenLike[], idx: number): string {
  const token = tokens[idx];
  if (token.nesting === 1) {
    return '<div class="md-tabs" data-tabs>\n';
  }
  return '</div>\n';
}

/** code-group 容器渲染 */
function codeGroupRender(tokens: TokenLike[], idx: number): string {
  const token = tokens[idx];
  if (token.nesting === 1) {
    return '<div class="md-code-group" data-code-group>\n';
  }
  return '</div>\n';
}

/**
 * 创建配置好的 markdown-it 实例。
 * - linkify: 裸链接自动转超链接
 * - typographer: 排版美化（智能引号等）
 * - 插件链: katex 数学公式 / task-lists 任务列表 / footnote 脚注 / mark 高亮
 * - 扩展: sub 下标 / sup 上标 / emoji 短码 / abbr 缩写
 * - 容器: GitHub Alerts / tip 容器 / details 折叠 / tabs / code-group
 */
export function createMarkdownIt(): MarkdownIt {
  return buildMarkdownIt(false);
}

/** 创建支持 HTML 标签的实例（用于修订模式注入高亮标记） */
export function createMarkdownItWithHtml(): MarkdownIt {
  return buildMarkdownIt(true);
}

function buildMarkdownIt(html: boolean): MarkdownIt {
  const md = new MarkdownIt({
    html,
    linkify: true,
    typographer: true,
  })
    // ── 基础插件 ──
    .use(katex, { throwOnError: false, errorColor: '#cc0000' })
    .use(taskLists, { enabled: true, label: true })
    .use(footnote)
    .use(mark)
    // ── 文本格式化 ──
    .use(sub)
    .use(sup)
    .use(emoji, { shortcuts: {} })
    .use(abbr)
    // ── 容器插件 ──
    .use(container, 'note', { render: containerRender('note') })
    .use(container, 'info', { render: containerRender('info') })
    .use(container, 'tip', { render: containerRender('tip') })
    .use(container, 'warning', { render: containerRender('warning') })
    .use(container, 'caution', { render: containerRender('caution') })
    .use(container, 'details', { render: detailsRender })
    .use(container, 'tabs', { render: tabsContainerOpen })
    .use(container, 'code-group', { render: codeGroupRender });

  // ── 自定义规则 ──
  tagLinks(md);
  setupGitHubAlerts(md);
  setupCodeBlockTitle(md);

  return md;
}

export const md = createMarkdownIt();
