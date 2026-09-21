import { invoke } from '@tauri-apps/api/core';

/** 读取本地文件文本内容 */
export async function readFile(path: string): Promise<string> {
  return invoke<string>('read_text_file', { path });
}

/** 拉取并清空首次启动（命令行）传入的文件列表，一次性消费 */
export async function getStartupFiles(): Promise<string[]> {
  return invoke<string[]>('get_startup_files');
}

/** 解析图片路径，返回 data URL 或网络 URL */
export async function resolveImage(mdFilePath: string, src: string): Promise<string> {
  return invoke<string>('resolve_image', { mdFilePath, src });
}

/** 在已渲染的 DOM 中遍历所有 <img>，把相对/绝对路径换为 data URL */
export async function resolveImages(container: HTMLElement, mdFilePath: string): Promise<void> {
  const imgs = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src') || '';
      if (/^(https?:|data:)/.test(src)) return;
      try {
        const dataUrl = await resolveImage(mdFilePath, src);
        img.src = dataUrl;
      } catch {
        img.src = PLACEHOLDER;
      }
    }),
  );
}

const PLACEHOLDER =
  'data:image/svg+xml;base64,PHN2Zz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZWVlIi8+PC9zdmc+';

/** 设置要监听的文件路径列表（调用 Rust watch_files 命令） */
export async function watchFiles(paths: string[]): Promise<void> {
  await invoke('watch_files', { paths });
}

/** 写入文件文本内容 */
export async function writeFile(path: string, content: string): Promise<void> {
  await invoke('write_text_file', { path, content });
}

/** 列出自定义主题 CSS 文件名 */
export async function listCustomThemes(): Promise<string[]> {
  return invoke<string[]>('list_custom_themes');
}

/** 保存自定义主题 CSS */
export async function saveCustomTheme(name: string, css: string): Promise<void> {
  await invoke('save_custom_theme', { name, css });
}

/** 读取自定义主题 CSS */
export async function readCustomTheme(name: string): Promise<string> {
  return invoke<string>('read_custom_theme', { name });
}

/** 删除自定义主题 */
export async function deleteCustomTheme(name: string): Promise<void> {
  await invoke('delete_custom_theme', { name });
}

/** 获取应用数据目录路径 */
export async function getAppDataDir(): Promise<string> {
  return invoke<string>('get_app_data_dir');
}
