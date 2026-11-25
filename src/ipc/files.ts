import { invoke } from '@tauri-apps/api/core';
import { stripBom } from '../utils/eol';

/** 读取本地文件文本内容（剥前导 UTF-8 BOM，否则第一个标题会解析失败） */
export async function readFile(path: string): Promise<string> {
  const raw = await invoke<string>('read_text_file', { path });
  return stripBom(raw);
}

/** 拉取并清空启动时暂存的文件列表（一次性消费）。
 *  调用后 Rust 端即认为前端已就绪，之后的二次启动 / 访达打开改为直接推 open-on-startup 事件。 */
export async function getStartupFiles(): Promise<string[]> {
  return invoke<string[]>('get_startup_files');
}

interface ResolvedImage {
  src: string;
  url: string | null;
}

/** 读取文档目录内的图片并返回 data URL；失败项不返回。 */
export async function readImagesAsDataUrls(
  mdFilePath: string,
  srcs: string[],
): Promise<Map<string, string>> {
  return new Map(
    await invoke<Array<[string, string]>>('read_images_as_data_urls', {
      mdFilePath,
      srcs,
    }),
  );
}

/**
 * 批量解析图片为一组本地协议 URL 或网络 URL。
 * 一次 IPC 解析全部图片，失败项返回 null，由调用方决定占位。
 */
export async function resolveImageUrls(
  mdFilePath: string,
  srcs: string[],
): Promise<Map<string, string | null>> {
  const resolved = await invoke<ResolvedImage[]>('resolve_image_urls', { mdFilePath, srcs });
  return new Map(resolved.map((item) => [item.src, item.url]));
}

/** 在已渲染的 DOM 中遍历所有 <img>，一次批量 IPC 换成本地协议 URL */
export async function resolveImages(container: HTMLElement, mdFilePath: string): Promise<void> {
  const imgs = Array.from(container.querySelectorAll<HTMLImageElement>('img'))
    .filter((img) => {
      const src = img.getAttribute('src') || '';
      // 协议名大小写不敏感；`HTTPS://` 也是网络图片，不能送去本地路径解析。
      return !/^(https?:|data:)/i.test(src);
    });
  if (imgs.length === 0) return;

  const srcs = Array.from(new Set(imgs.map((img) => img.getAttribute('src') || '')));
  // 先记下原始地址：即使 IPC 失败，导出时仍可凭它重新读取图片。
  imgs.forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (src) img.setAttribute('data-image-src', src);
  });
  try {
    const urls = await resolveImageUrls(mdFilePath, srcs);
    imgs.forEach((img) => {
      const src = img.getAttribute('src') || '';
      img.setAttribute('src', urls.get(src) ?? IMAGE_PLACEHOLDER);
    });
  } catch {
    imgs.forEach((img) => {
      img.setAttribute('src', IMAGE_PLACEHOLDER);
    });
  }
}

export const IMAGE_PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160">'
      + '<rect width="320" height="160" rx="8" fill="#eef0f3"/>'
      + '<text x="160" y="86" fill="#8b9099" font-family="sans-serif" font-size="14" text-anchor="middle">图片未找到</text>'
      + '</svg>',
  );

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
