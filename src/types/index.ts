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
  /** 后台高亮全部完成后置为 true；false 时仍有代码块使用普通 <pre> */
  highlightComplete: boolean;
  toc: TocItem[];
  tocExpanded: Record<string, boolean>;
  isLoading: boolean;
  /** 会话恢复的占位标签：尚未读取文件，首次激活时才构建 */
  isLazy?: boolean;
  /** 读取失败的原因；此时 source 为空，禁止进入编辑以免覆盖磁盘原文件 */
  loadError?: string;
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
