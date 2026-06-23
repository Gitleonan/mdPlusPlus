import { describe, it, expect } from 'vitest';
import { computeLineDiff, segmentHunks, groupChangeSegments } from './diff';

describe('computeLineDiff', () => {
  it('detects a single line change', () => {
    const oldText = 'line1\nline2\nline3\n';
    const newText = 'line1\nline2-modified\nline3\n';
    const hunks = computeLineDiff(oldText, newText);

    const added = hunks.filter(h => h.type === 'added');
    const removed = hunks.filter(h => h.type === 'removed');
    expect(added.length).toBe(1);
    expect(removed.length).toBe(1);
    expect(added[0].content).toBe('line2-modified');
    expect(removed[0].content).toBe('line2');
  });

  it('detects multiple separated changes', () => {
    const oldText = [
      '# Title',
      '',
      'paragraph one',
      '',
      'paragraph two',
      '',
      'paragraph three',
      '',
      '## Section',
      '',
      'content here',
    ].join('\n');

    const newText = [
      '# Title',
      '',
      'paragraph one MODIFIED',   // change 1
      '',
      'paragraph two',
      '',
      'paragraph three MODIFIED', // change 2
      '',
      '## Section',
      '',
      'content here MODIFIED',    // change 3
    ].join('\n');

    const hunks = computeLineDiff(oldText, newText);

    const added = hunks.filter(h => h.type === 'added');
    const removed = hunks.filter(h => h.type === 'removed');

    // 应该有 3 处修改 = 3 added + 3 removed
    console.log('added hunks:', added.map(h => h.content));
    console.log('removed hunks:', removed.map(h => h.content));

    expect(added.length).toBe(3);
    expect(removed.length).toBe(3);

    // 验证 type 序列：应该有交替的 removed/added 组
    const types = hunks.map(h => h.type);
    console.log('full types:', types);
  });

  it('correctly interleaves added/removed for separated changes', () => {
    const oldText = 'a\nb\nc\nd\ne\n';
    const newText = 'a\nB\nc\nD\ne\n';

    const hunks = computeLineDiff(oldText, newText);
    const types = hunks.map(h => h.type);

    console.log('types sequence:', types);

    // Expected: unchanged, removed, added, unchanged, removed, added, unchanged
    const addedCount = hunks.filter(h => h.type === 'added').length;
    const removedCount = hunks.filter(h => h.type === 'removed').length;

    expect(addedCount).toBe(2);
    expect(removedCount).toBe(2);
  });

  it('handles multiline changes correctly', () => {
    // 模拟实际场景：多处修改，每处多行
    const oldText = [
      '# 标题',
      '',
      '这是第一段内容。',
      '这是第一段第二行。',
      '',
      '这是第二段内容。',
      '',
      '## 第二章',
      '',
      '第三章内容第一行。',
      '第三章内容第二行。',
    ].join('\n');

    const newText = [
      '# 标题',
      '',
      '这是第一段内容（已修改）。',      // 修改 1
      '这是第一段第二行（已修改）。',    // 修改 1
      '',
      '这是第二段内容（已修改）。',      // 修改 2
      '',
      '## 第二章',
      '',
      '第三章内容第一行（已修改）。',    // 修改 3
      '第三章内容第二行（已修改）。',    // 修改 3
    ].join('\n');

    const hunks = computeLineDiff(oldText, newText);
    const types = hunks.map(h => h.type);
    console.log('multiline types:', types);

    // 应该有多组 removed/added
    const removedGroups = [];
    const addedGroups = [];
    let currentGroup: string[] = [];
    let currentType: string | null = null;

    for (const h of hunks) {
      if (h.type !== currentType) {
        if (currentGroup.length > 0 && currentType) {
          if (currentType === 'removed') removedGroups.push([...currentGroup]);
          else if (currentType === 'added') addedGroups.push([...currentGroup]);
        }
        currentGroup = [h.content];
        currentType = h.type;
      } else {
        currentGroup.push(h.content);
      }
    }
    if (currentGroup.length > 0 && currentType) {
      if (currentType === 'removed') removedGroups.push([...currentGroup]);
      else if (currentType === 'added') addedGroups.push([...currentGroup]);
    }

    console.log('removedGroups:', removedGroups);
    console.log('addedGroups:', addedGroups);

    // 应该有 3 处修改
    expect(removedGroups.length).toBe(3);
    expect(addedGroups.length).toBe(3);

    // 每处修改的第一处应该是 2 行
    expect(removedGroups[0].length).toBe(2);
    expect(addedGroups[0].length).toBe(2);
  });
});

describe('groupChangeSegments', () => {
  it('把一次保存的多处修改归为多个变更点', () => {
    const oldText = [
      '# 标题', '',
      '第一段。', '',
      '第二段。', '',
      '第三段。',
    ].join('\n');
    const newText = [
      '# 标题', '',
      '第一段改。',   // 变更点 1
      '',
      '第二段。',
      '',
      '第三段改。',   // 变更点 2
    ].join('\n');

    const hunks = computeLineDiff(oldText, newText);
    const segments = segmentHunks(hunks);
    const groups = groupChangeSegments(segments);

    // 两处分离修改 = 2 个变更点
    expect(groups.length).toBe(2);
    // 每个变更点含 1 个 removed 段 + 1 个 added 段
    expect(groups[0].length).toBe(2);
    expect(groups[1].length).toBe(2);
  });

  it('单次整段替换只算一个变更点', () => {
    const oldText = 'a\nb\nc\n';
    const newText = 'x\ny\nz\n';
    const hunks = computeLineDiff(oldText, newText);
    const groups = groupChangeSegments(segmentHunks(hunks));
    expect(groups.length).toBe(1);
  });

  it('无变更时返回空数组', () => {
    const hunks = computeLineDiff('同\n样\n', '同\n样\n');
    expect(groupChangeSegments(segmentHunks(hunks))).toEqual([]);
  });
});
