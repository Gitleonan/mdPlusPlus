import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './render';

describe('renderMarkdown', () => {
  // ── 基础 Markdown ──

  it('renders headings', () => {
    const html = renderMarkdown('# Hello');
    expect(html).toContain('<h1');
    expect(html).toContain('Hello');
  });

  it('renders unordered list', () => {
    const html = renderMarkdown('- a\n- b');
    expect(html).toContain('<ul');
    expect(html).toContain('<li>a</li>');
  });

  it('renders code block with language class', () => {
    const html = renderMarkdown('```ts\nconst x = 1;\n```');
    expect(html).toContain('language-ts');
  });

  it('renders inline code', () => {
    const html = renderMarkdown('use `code` here');
    expect(html).toContain('<code>code</code>');
  });

  it('renders task list checkbox', () => {
    const html = renderMarkdown('- [x] done\n- [ ] todo');
    expect(html).toMatch(/checkbox/i);
  });

  it('renders footnote', () => {
    const html = renderMarkdown('Text[^1]\n\n[^1]: note');
    expect(html).toMatch(/footnote/i);
  });

  it('renders highlight mark', () => {
    const html = renderMarkdown('==highlighted==');
    expect(html).toContain('<mark');
  });

  it('renders auto-linkified bare url', () => {
    const html = renderMarkdown('see https://example.com here');
    expect(html).toContain('href="https://example.com"');
  });

  it('renders inline math', () => {
    const html = renderMarkdown('$a + b = c$');
    expect(html).toMatch(/katex/i);
  });

  it('renders table', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table');
    expect(html).toContain('<th>a</th>');
  });

  it('renders blockquote', () => {
    const html = renderMarkdown('> quoted');
    expect(html).toContain('<blockquote');
  });

  it('renders display math from test-features without swallowing delimiters', () => {
    const html = renderMarkdown('$$\n\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}\n$$');

    expect(html).toContain('katex-display');
    expect(html).not.toContain('$$');
  });

  // ── GitHub Alerts ──

  it('renders GitHub Alert NOTE', () => {
    const html = renderMarkdown('> [!NOTE]\n> This is a note');
    expect(html).toContain('github-alert');
    expect(html).toContain('github-alert-note');
    expect(html).toContain('This is a note');
  });

  it('does not leave a blank line before GitHub Alert content', () => {
    const html = renderMarkdown('> [!NOTE]\n> This is a note');

    expect(html).not.toMatch(/github-alert-title[\s\S]*?<br\s*\/?>/);
  });

  it('renders GitHub Alert WARNING', () => {
    const html = renderMarkdown('> [!WARNING]\n> Be careful');
    expect(html).toContain('github-alert-warning');
    expect(html).toContain('Be careful');
  });

  it('renders GitHub Alert CAUTION', () => {
    const html = renderMarkdown('> [!CAUTION]\n> Danger ahead');
    expect(html).toContain('github-alert-caution');
  });

  // ── Tip 容器 ──

  it('renders tip container', () => {
    const html = renderMarkdown('::: tip My Tip\nContent here\n:::');
    expect(html).toContain('md-container-tip');
    expect(html).toContain('My Tip');
    expect(html).toContain('Content here');
  });

  it('renders warning container', () => {
    const html = renderMarkdown('::: warning\nBe careful\n:::');
    expect(html).toContain('md-container-warning');
  });

  it('renders note container', () => {
    const html = renderMarkdown('::: note\nNote content\n:::');
    expect(html).toContain('md-container-note');
  });

  // ── Details 折叠 ──

  it('renders details container', () => {
    const html = renderMarkdown('::: details Click to expand\nHidden content\n:::');
    expect(html).toContain('<details');
    expect(html).toContain('<summary');
    expect(html).toContain('Click to expand');
    expect(html).toContain('Hidden content');
  });

  it('renders raw <details><summary> block with markdown inside', () => {
    const html = renderMarkdown(
      '<details>\n<summary>DDL</summary>\n\n```sql\nselect 1;\n```\n\n</details>',
    );
    expect(html).toContain('<details class="md-details"');
    expect(html).toContain('<summary class="md-details-summary">DDL</summary>');
    expect(html).toContain('language-sql');
  });

  it('renders raw details when summary is on the same line', () => {
    const html = renderMarkdown('<details><summary>数据库 DDL</summary>\n\n内容\n\n</details>');
    expect(html).toContain('<summary class="md-details-summary">数据库 DDL</summary>');
    expect(html).toContain('<p>内容</p>');
  });

  it('keeps <details> inside fenced code untouched', () => {
    const html = renderMarkdown('```html\n<details><summary>DDL</summary></details>\n```');
    expect(html).not.toContain('md-details');
    expect(html).toContain('&lt;details&gt;');
  });

  it('keeps pipes inside inline code from splitting table cells', () => {
    const html = renderMarkdown(
      '| 决策 | 键 |\n|---|---|\n| D1 | `MTR:锭号|B:批次号` |',
    );
    expect(html).toContain('<code>MTR:锭号|B:批次号</code>');
    expect((html.match(/<td>/g) ?? []).length).toBe(2);
  });

  it('escapes container titles instead of injecting HTML', () => {
    const html = renderMarkdown('::: note <img src=x onerror=alert(1)>\nbody\n:::');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });

  // ── 代码块标题 ──

  it('renders code block with title', () => {
    const html = renderMarkdown('```js title="example.js"\nconsole.log("hi");\n```');
    expect(html).toContain('code-block-wrapper');
    expect(html).toContain('has-title');
    expect(html).toContain('code-block-title');
    expect(html).toContain('example.js');
  });

  it('renders code block without title', () => {
    const html = renderMarkdown('```js\nconsole.log("hi");\n```');
    expect(html).toContain('code-block-wrapper');
    expect(html).not.toContain('has-title');
  });

  // ── 上标/下标 ──

  it('renders superscript', () => {
    const html = renderMarkdown('19^th^');
    expect(html).toContain('<sup');
    expect(html).toContain('th');
  });

  it('renders subscript', () => {
    const html = renderMarkdown('H~2~O');
    expect(html).toContain('<sub');
    expect(html).toContain('2');
  });

  // ── 缩写 ──

  it('renders abbreviation', () => {
    const html = renderMarkdown('HTML is great.\n\n*[HTML]: Hyper Text Markup Language');
    expect(html).toContain('<abbr');
    expect(html).toContain('Hyper Text Markup Language');
  });

  // ── Emoji ──

  it('renders emoji shortcode', () => {
    const html = renderMarkdown(':smile:');
    // emoji 插件会将 :smile: 替换为对应的 emoji 字符或 HTML
    expect(html).toContain('😄');
  });

  // ── 综合测试：验证 test-features.md 中的关键语法 ──

  it('renders mixed content with multiple extensions', () => {
    const source = `# Test

> [!NOTE]
> Alert content

::: tip Title
Tip content
:::

::: details Click
Hidden
:::

\`\`\`js title="app.js"
const x = 1; // [!code highlight]
\`\`\`

H~2~O and E = mc^2^

:heart: love

HTML is great.

*[HTML]: Hyper Text Markup Language
`;
    const html = renderMarkdown(source);

    // GitHub Alert
    expect(html).toContain('github-alert-note');

    // Tip container
    expect(html).toContain('md-container-tip');
    expect(html).toContain('Title');

    // Details
    expect(html).toContain('<details');
    expect(html).toContain('Click');

    // Code block title
    expect(html).toContain('code-block-title');
    expect(html).toContain('app.js');

    // Subscript
    expect(html).toContain('<sub');

    // Superscript
    expect(html).toContain('<sup');

    // Emoji
    expect(html).toContain('❤');

    // Abbreviation
    expect(html).toContain('<abbr');
    expect(html).toContain('Hyper Text Markup Language');
  });
});
