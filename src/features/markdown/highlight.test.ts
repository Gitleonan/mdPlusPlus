import { describe, it, expect } from 'vitest';
import { highlightCodeBlocks } from './highlight';

describe('highlightCodeBlocks', () => {
  it('replaces code block with shiki output', async () => {
    const input = '<div class="code-block-wrapper">\n<pre><code class="language-ts">const x = 1;</code></pre>\n</div>';
    const result = await highlightCodeBlocks(input, 'light');
    // shiki 渲染后会输出带 shiki 类的 <pre>
    expect(result).toContain('shiki');
    expect(result).toContain('const');
  });

  it('handles code block with title', async () => {
    const input = '<div class="code-block-wrapper has-title">\n<div class="code-block-title">file.ts</div>\n<pre><code class="language-ts">const x = 1;</code></pre>\n</div>';
    const result = await highlightCodeBlocks(input, 'light');
    expect(result).toContain('shiki');
    expect(result).toContain('file.ts');
  });

  it('leaves unknown language as plain', async () => {
    const input = '<div class="code-block-wrapper">\n<pre><code class="language-xyz">hello</code></pre>\n</div>';
    const result = await highlightCodeBlocks(input, 'light');
    expect(result).toContain('hello');
  });

  it('keeps mermaid code blocks recognizable for mermaid post-processing', async () => {
    const input = '<div class="code-block-wrapper">\n<pre><code class="language-mermaid">graph TD\nA--&gt;B</code></pre>\n</div>';
    const result = await highlightCodeBlocks(input, 'light');

    expect(result).toContain('language-mermaid');
    expect(result).toContain('graph TD');
  });

  it('emits dual-theme CSS variables instead of fixed colors', async () => {
    const input = '<div class="code-block-wrapper">\n<pre><code class="language-ts">const x = 1;</code></pre>\n</div>';
    const result = await highlightCodeBlocks(input);
    expect(result).toContain('--shiki-light');
    expect(result).toContain('--shiki-dark');
  });

  it('handles multiple code blocks', async () => {
    const input = '<div class="code-block-wrapper">\n<pre><code class="language-ts">const a = 1;</code></pre>\n</div><div class="code-block-wrapper">\n<pre><code class="language-bash">echo hi</code></pre>\n</div>';
    const result = await highlightCodeBlocks(input, 'light');
    expect(result).toContain('const');
    expect(result).toContain('echo');
  });

  it('returns empty string for empty input', async () => {
    expect(await highlightCodeBlocks('', 'light')).toBe('');
  });
});
