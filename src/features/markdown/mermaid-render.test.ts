import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderMermaidInContainer } from './mermaid';

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
  render: vi.fn(),
}));

vi.mock('mermaid', () => ({
  default: mermaidMock,
}));

describe('renderMermaidInContainer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mermaidMock.initialize.mockClear();
    mermaidMock.parse.mockReset();
    mermaidMock.render.mockReset();
  });

  it('initializes mermaid with the strict security level', async () => {
    mermaidMock.render.mockResolvedValue({ svg: '<svg></svg>' });

    const container = document.createElement('main');
    container.innerHTML = '<div class="mermaid">flowchart TB\nA-->B</div>';
    document.body.appendChild(container);

    await renderMermaidInContainer(container);

    expect(mermaidMock.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ startOnLoad: false, securityLevel: 'strict' }),
    );
  });

  it('passes a hidden host element to mermaid.render and cleans it up afterwards', async () => {
    const seenHosts: HTMLElement[] = [];
    mermaidMock.render.mockImplementation((_id: string, _source: string, host?: HTMLElement) => {
      if (host) seenHosts.push(host);
      return Promise.resolve({ svg: '<svg data-ok="true"></svg>' });
    });

    const container = document.createElement('main');
    container.className = 'md-content';
    container.innerHTML = '<div class="mermaid">flowchart TB\nA-->B</div>';
    document.body.appendChild(container);

    await renderMermaidInContainer(container);

    expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    expect(seenHosts).toHaveLength(1);
    expect(seenHosts[0].tagName).toBe('DIV');
    // host should have been removed from body after render
    expect(seenHosts[0].isConnected).toBe(false);
    expect(container.querySelector('svg[data-ok="true"]')).not.toBeNull();
    expect(container.querySelector('.mermaid-error')).toBeNull();
  });

  it('renders the real mermaid error message inside the content container on failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mermaidMock.render.mockRejectedValue(new Error('Parse error: unexpected token'));

    const container = document.createElement('main');
    container.className = 'md-content';
    container.innerHTML = '<div class="mermaid">graph TD\nA[bad?]</div>';
    document.body.appendChild(container);

    await renderMermaidInContainer(container);

    expect(mermaidMock.render).toHaveBeenCalled();
    const err = container.querySelector('.mermaid-error');
    expect(err).not.toBeNull();
    expect(err?.textContent).toContain('Parse error: unexpected token');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('does not delete unrelated nodes added to document.body during render', async () => {
    // Simulate a parallel React effect mounting a modal while mermaid.render awaits.
    mermaidMock.render.mockImplementation(() => {
      const modal = document.createElement('div');
      modal.id = 'unrelated-modal';
      document.body.appendChild(modal);
      return Promise.resolve({ svg: '<svg data-ok="true"></svg>' });
    });

    const container = document.createElement('main');
    container.className = 'md-content';
    container.innerHTML = '<div class="mermaid">flowchart TB\nA-->B</div>';
    document.body.appendChild(container);

    await renderMermaidInContainer(container);

    expect(document.body.querySelector('#unrelated-modal')).not.toBeNull();
  });

  it('converts shiki-rendered code.language-mermaid blocks into rendered SVGs', async () => {
    mermaidMock.render.mockResolvedValue({ svg: '<svg data-from-code="true"></svg>' });

    const container = document.createElement('main');
    container.className = 'md-content';
    container.innerHTML =
      '<div class="code-block-wrapper"><pre><code class="language-mermaid">flowchart TB\nA-->B</code></pre></div>';
    document.body.appendChild(container);

    await renderMermaidInContainer(container);

    expect(mermaidMock.render).toHaveBeenCalledWith(
      expect.any(String),
      'flowchart TB\nA-->B',
      expect.any(HTMLElement),
    );
    expect(container.querySelector('svg[data-from-code="true"]')).not.toBeNull();
    expect(container.querySelector('code.language-mermaid')).toBeNull();
  });
});
