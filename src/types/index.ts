export interface TocItem {
  id: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

export interface Tab {
  id: string;
  filePath: string;
  fileName: string;
  source: string;
  html: string;
  toc: TocItem[];
  scrollTop: number;
  tocExpanded: Record<string, boolean>;
  isLoading: boolean;
}

export interface RecentFile {
  path: string;
  name: string;
  lastOpenedAt: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';

/** 行级 diff 单元 */
export interface RevisionHunk {
  type: 'added' | 'removed' | 'unchanged';
  content: string;       // 该行内容
  oldLineNo?: number;    // 旧文件行号（removed / unchanged）
  newLineNo?: number;    // 新文件行号（added / unchanged）
}

/** 单次修订记录 */
export interface Revision {
  id: string;
  timestamp: number;
  oldSource: string;      // 变更前的完整源码
  newSource: string;      // 变更后的完整源码
  hunks: RevisionHunk[];  // 行级 diff 结果
}
