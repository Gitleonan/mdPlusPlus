import { describe, it, expect } from 'vitest';
import { detectEol, normalizeEol, restoreEol, stripBom } from './eol';

describe('detectEol', () => {
  it('纯 CRLF 文件检测为 CRLF', () => {
    expect(detectEol('line1\r\nline2\r\nline3\r\n')).toBe('\r\n');
  });

  it('纯 LF 文件检测为 LF', () => {
    expect(detectEol('line1\nline2\nline3\n')).toBe('\n');
  });

  it('混合文件按多数派判定', () => {
    // 3 个 CRLF，2 个裸 LF → CRLF
    expect(detectEol('a\r\nb\r\nc\r\nd\ne\n')).toBe('\r\n');
    // 2 个 CRLF，3 个裸 LF → LF
    expect(detectEol('a\r\nb\r\nc\nd\ne\n')).toBe('\n');
  });
});

describe('restoreEol', () => {
  it('CRLF 文件经 textarea 归一化后可完整还原', () => {
    const original = 'line1\r\nline2\r\nline3\r\n';
    const normalized = normalizeEol(original);
    expect(restoreEol(normalized, detectEol(original))).toBe(original);
  });

  it('LF 文件保持不变', () => {
    const original = 'line1\nline2\n';
    expect(restoreEol(original, detectEol(original))).toBe(original);
  });

  it('末尾无换行的 CRLF 文件往返不丢失该特征', () => {
    const original = 'line1\r\nline2';
    const normalized = normalizeEol(original);
    expect(restoreEol(normalized, detectEol(original))).toBe(original);
  });
});

describe('stripBom', () => {
  it('剥离前导 UTF-8 BOM', () => {
    expect(stripBom('﻿# 标题\n\n正文')).toBe('# 标题\n\n正文');
  });

  it('无 BOM 原样返回', () => {
    expect(stripBom('# 标题')).toBe('# 标题');
  });
});
