import { md } from './plugins';
import type { TocItem } from '../../types';
import { slugifyHeading } from './slug';
import type Token from 'markdown-it/lib/token.mjs';

/** 从已解析的 token 流收集 heading，返回扁平 TOC */
export function collectToc(tokens: Token[]): TocItem[] {
  const items: TocItem[] = [];
  const seen = new Map<string, number>();

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'heading_open') {
      const level = Number(t.tag.slice(1)) as TocItem['level'];
      // 下一个 inline token 是标题文本
      const inline = tokens[i + 1];
      const text = inline?.content ?? '';
      const id = slugifyHeading(text, seen);
      items.push({ id, level, text });
    }
  }
  return items;
}

/** 在 markdown-it 解析时收集 heading token，返回扁平 TOC */
export function extractToc(source: string): TocItem[] {
  return collectToc(md.parse(source, {}));
}
