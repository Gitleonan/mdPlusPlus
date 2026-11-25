use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::http::{header, Request, Response, StatusCode};

const BASE64_TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// 离线导出只需要把已通过白名单校验的图片内联进 HTML，
/// 不值得为它引入一个仅此处使用的 base64 依赖。
fn base64_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let first = chunk[0];
        let second = chunk.get(1).copied();
        let third = chunk.get(2).copied();
        out.push(BASE64_TABLE[(first >> 2) as usize] as char);
        out.push(
            BASE64_TABLE[(((first & 0b11) << 4) | (second.unwrap_or(0) >> 4)) as usize] as char,
        );
        out.push(match second {
            Some(value) => {
                BASE64_TABLE[(((value & 0b1111) << 2) | (third.unwrap_or(0) >> 6)) as usize] as char
            }
            None => '=',
        });
        out.push(match third {
            Some(value) => BASE64_TABLE[(value & 0b111111) as usize] as char,
            None => '=',
        });
    }
    out
}

/// 允许图片协议读取的目录白名单。
///
/// 前端在打开文档时登记文档所在目录，协议处理器只接受这些目录内的
/// 规范化路径。这样即使 Markdown 里写了 `../../secret.png`，也无法借
/// 自定义协议读取任意文件。
#[derive(Default)]
pub struct ImageScope {
    roots: Mutex<HashSet<PathBuf>>,
}

impl ImageScope {
    /// 登记文档目录，返回该目录的规范化绝对路径。
    pub fn allow_document(&self, md_file_path: &str) -> Result<PathBuf, String> {
        let dir = Path::new(md_file_path)
            .parent()
            .ok_or_else(|| "文档路径没有父目录".to_string())?;
        let root = fs::canonicalize(dir).map_err(|e| format!("无法解析文档目录: {}", e))?;
        self.roots
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .insert(root.clone());
        Ok(root)
    }

    /// 解析并校验图片路径：必须在已登记目录内，且不能借符号链接逃逸。
    #[cfg(test)]
    pub fn resolve(&self, md_file_path: &str, src: &str) -> Result<PathBuf, String> {
        let root = self.allow_document(md_file_path)?;
        self.resolve_in_root(&root, src)
    }

    fn resolve_in_root(&self, root: &Path, src: &str) -> Result<PathBuf, String> {
        let decoded = percent_decode(src)?;
        let candidate = if Path::new(&decoded).is_absolute() {
            PathBuf::from(&decoded)
        } else {
            root.join(&decoded)
        };
        let canonical =
            fs::canonicalize(&candidate).map_err(|e| format!("图片不存在或无法访问: {}", e))?;
        if !canonical.starts_with(&root) {
            return Err("图片路径超出文档目录".to_string());
        }
        if !canonical.is_file() {
            return Err("图片路径不是文件".to_string());
        }
        if image_mime(&canonical).is_none() {
            return Err("只允许读取图片文件".to_string());
        }
        Ok(canonical)
    }
}

/// 相对路径里的 `..` 只允许在文档目录内回落；最终仍由 canonicalize +
/// starts_with 判定，这里先拒绝明显的绝对前缀和空路径。
fn percent_decode(src: &str) -> Result<String, String> {
    let trimmed = src.trim();
    if trimmed.is_empty() {
        return Err("图片地址为空".to_string());
    }
    let without_query = trimmed.split(['?', '#']).next().unwrap_or(trimmed);
    let mut out = Vec::with_capacity(without_query.len());
    let bytes = without_query.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            // 必须按字节解析：`%` 后面可能紧跟多字节 UTF-8 字符，
            // 用 `&str[i + 1..i + 3]` 会在非字符边界 panic。
            if let (Some(high), Some(low)) = (hex_value(bytes[i + 1]), hex_value(bytes[i + 2])) {
                let value = (high << 4) | low;
                out.push(value);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).map_err(|_| "图片路径不是有效 UTF-8".to_string())
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

/// 把绝对路径安全地编码进自定义协议 URL。
pub fn image_url(path: &Path) -> String {
    // Windows canonicalize 返回 `\\?\C:\...`（verbatim 路径）。这个前缀
    // 进入 URL 后会变成 `//%3F/C%3A/...`，被协议和浏览器当成非法路径。
    // 去掉前缀后再编码；UNC 的 `\\?\UNC\server\share` 还原成 `\\server\share`。
    let raw = path.to_string_lossy().replace('\\', "/");
    let raw = raw
        .strip_prefix("//?/UNC/")
        .map(|rest| format!("//{rest}"))
        .or_else(|| raw.strip_prefix("//?/").map(str::to_string))
        .unwrap_or(raw);
    let mut encoded = String::new();
    for byte in raw.bytes() {
        let ch = byte as char;
        if ch.is_ascii_alphanumeric() || matches!(ch, '/' | '-' | '_' | '.' | '~') {
            encoded.push(ch);
        } else {
            encoded.push_str(&format!("%{:02X}", byte));
        }
    }
    let url = if encoded.starts_with('/') {
        format!("mdpp-img://localhost{}", encoded)
    } else {
        format!("mdpp-img://localhost/{}", encoded)
    };
    if cfg!(windows) {
        // WebView2 会把自定义协议映射成 http://<scheme>.localhost
        url.replacen("mdpp-img://localhost", "http://mdpp-img.localhost", 1)
    } else {
        url
    }
}

#[derive(Serialize)]
pub struct ResolvedImage {
    pub src: String,
    pub url: Option<String>,
}

/// 导出 HTML/PDF 时把本地图片内联成 data URL，避免导出文件依赖应用内的
/// `mdpp-img` 协议。返回 src -> data URL；失败项不返回，由调用方保留占位。
#[tauri::command]
pub async fn read_images_as_data_urls(
    scope: tauri::State<'_, ImageScope>,
    md_file_path: String,
    srcs: Vec<String>,
) -> Result<Vec<(String, String)>, String> {
    let root = scope.allow_document(&md_file_path)?;
    Ok(srcs
        .into_iter()
        .filter_map(|src| image_data_url(&scope, &root, &src))
        .collect())
}

fn image_data_url(scope: &ImageScope, root: &Path, src: &str) -> Option<(String, String)> {
    if is_external_image(src) {
        return None;
    }
    let path = scope.resolve_in_root(root, src).ok()?;
    let mime = image_mime(&path)?;
    let bytes = fs::read(path).ok()?;
    Some((
        src.to_string(),
        format!("data:{};base64,{}", mime, base64_encode(&bytes)),
    ))
}

/// 批量解析 Markdown 图片：一次 IPC 只规范化一次文档目录。
/// 无法解析的图片返回 `url: None`，由前端统一显示占位图。
#[tauri::command]
pub async fn resolve_image_urls(
    scope: tauri::State<'_, ImageScope>,
    md_file_path: String,
    srcs: Vec<String>,
) -> Result<Vec<ResolvedImage>, String> {
    let root = scope.allow_document(&md_file_path)?;
    Ok(srcs
        .into_iter()
        .map(|src| {
            let url = if is_external_image(&src) {
                Some(src.clone())
            } else {
                scope
                    .resolve_in_root(&root, &src)
                    .ok()
                    .map(|path| image_url(&path))
            };
            ResolvedImage { src, url }
        })
        .collect())
}

fn is_external_image(src: &str) -> bool {
    // 协议名大小写不敏感（RFC 3986）；否则 `HTTPS://…` 会被当成相对路径，
    // 预览阶段解析失败变成占位图，导出时也会被错误地拦下。
    ["http://", "https://", "data:"]
        .iter()
        // `get` 在非字符边界返回 None，避免中文路径开头的切片 panic。
        .any(|prefix| src.get(..prefix.len()).is_some_and(|head| head.eq_ignore_ascii_case(prefix)))
}

/// 自定义协议处理器：只读取白名单目录内的文件，并返回正确的 MIME。
pub fn handle_image_protocol(scope: &ImageScope, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let raw = request.uri().path();
    // 自定义协议在 Windows 会被映射成 http://mdpp-img.localhost/<path>，
    // 在 macOS/Linux 则是 mdpp-img://localhost/<path>；两者都可能收到
    // `%2F` 编码后的路径。Unix 的绝对路径必须保留开头 `/`，
    // 只有 Windows 的 `/C:/...` 形式才需要去掉前导斜杠。
    let mut decoded = match percent_decode(raw) {
        Ok(p) => PathBuf::from(p),
        Err(_) => return error_response(StatusCode::BAD_REQUEST),
    };
    if !decoded.is_absolute() {
        // Windows 的 `/C:/...` 是自定义协议常见形式；去掉前导斜杠后才是盘符路径。
        let text = decoded.to_string_lossy();
        let trimmed = text.trim_start_matches(['/', '\\']);
        let candidate = PathBuf::from(trimmed);
        if cfg!(windows) && candidate.is_absolute() {
            decoded = candidate;
        } else {
            return error_response(StatusCode::BAD_REQUEST);
        }
    }
    let candidate = decoded;
    let canonical = match fs::canonicalize(&candidate) {
        Ok(p) => p,
        Err(_) => return error_response(StatusCode::NOT_FOUND),
    };
    let allowed = scope
        .roots
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .iter()
        .any(|root| canonical.starts_with(root));
    if !allowed {
        return error_response(StatusCode::FORBIDDEN);
    }
    let Some(mime) = image_mime(&canonical) else {
        // 自定义协议不能返回可执行的 SVG 或目录内任意文本文件。
        // SVG 中的 <script>/onload 会获得应用上下文；扩展名白名单也避免
        // 借用图片 URL 读取 .txt/.json 等同目录文件。
        return error_response(StatusCode::UNSUPPORTED_MEDIA_TYPE);
    };
    match fs::read(&canonical) {
        Ok(bytes) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, mime)
            .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
            .header(header::CACHE_CONTROL, "no-cache")
            .body(bytes)
            .unwrap_or_else(|_| error_response(StatusCode::INTERNAL_SERVER_ERROR)),
        Err(_) => error_response(StatusCode::NOT_FOUND),
    }
}

fn error_response(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(Vec::new())
        .expect("static response is valid")
}

fn image_mime(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => Some("image/png"),
        Some("jpg") | Some("jpeg") => Some("image/jpeg"),
        Some("gif") => Some("image/gif"),
        Some("webp") => Some("image/webp"),
        Some("bmp") => Some("image/bmp"),
        Some("ico") => Some("image/x-icon"),
        Some("avif") => Some("image/avif"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_fixture() -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!(
            "mdpp-image-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let docs = base.join("docs");
        fs::create_dir_all(&docs).unwrap();
        let md = docs.join("note.md");
        fs::write(&md, "# note").unwrap();
        let img = docs.join("image.png");
        let mut f = fs::File::create(&img).unwrap();
        f.write_all(&[0x89, b'P', b'N', b'G']).unwrap();
        (md, img)
    }

    #[test]
    fn resolves_images_inside_document_directory() {
        let (md, img) = temp_fixture();
        let scope = ImageScope::default();
        let resolved = scope.resolve(md.to_str().unwrap(), "image.png").unwrap();
        assert_eq!(resolved, fs::canonicalize(img).unwrap());
    }

    #[test]
    fn rejects_images_outside_document_directory() {
        let (md, _) = temp_fixture();
        let outside = std::env::temp_dir().join("mdpp-outside.png");
        fs::write(&outside, b"x").unwrap();
        let scope = ImageScope::default();
        let result = scope.resolve(md.to_str().unwrap(), outside.to_str().unwrap());
        assert!(result.is_err());
    }

    #[test]
    fn protocol_rejects_unregistered_files() {
        let (_md, img) = temp_fixture();
        let scope = ImageScope::default();
        let request = Request::builder()
            .uri(image_url(&img))
            .body(Vec::new())
            .unwrap();
        let response = handle_image_protocol(&scope, &request);
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[test]
    fn protocol_serves_registered_images_with_mime() {
        let (md, img) = temp_fixture();
        let scope = ImageScope::default();
        scope.allow_document(md.to_str().unwrap()).unwrap();
        let request = Request::builder()
            .uri(image_url(&img))
            .body(Vec::new())
            .unwrap();
        // 自定义协议在 Unix 上必须保留绝对路径开头的 `/`；
        // Windows 的 http://mdpp-img.localhost/ 形式在 URI path 里不含它。
        if !cfg!(windows) {
            assert_eq!(
                request.uri().path(),
                img.to_str().unwrap(),
                "unix protocol URI must keep its leading slash"
            );
        }
        let response = handle_image_protocol(&scope, &request);
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "image/png"
        );
    }

    #[test]
    fn protocol_serves_images_in_chinese_directories_with_spaces() {
        let base = std::env::temp_dir().join(format!(
            "mdpp-image-cn-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let docs = base.join("文档 目录").join("assets");
        fs::create_dir_all(&docs).unwrap();
        let md = base.join("文档 目录").join("note.md");
        fs::write(&md, "# note").unwrap();
        let img = docs.join("test image.png");
        fs::write(&img, [0x89, b'P', b'N', b'G']).unwrap();

        let scope = ImageScope::default();
        let resolved = scope
            .resolve(md.to_str().unwrap(), "assets/test%20image.png")
            .unwrap();
        assert_eq!(resolved, fs::canonicalize(&img).unwrap());

        let url = image_url(&resolved);
        assert!(
            !url.contains('?'),
            "verbatim prefix must not leak into the URL: {url}"
        );
        let request = Request::builder().uri(&url).body(Vec::new()).unwrap();
        let response = handle_image_protocol(&scope, &request);
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "image/png"
        );
    }

    #[test]
    fn protocol_refuses_svg_because_it_can_carry_scripts() {
        let (md, _) = temp_fixture();
        let svg = md.parent().unwrap().join("unsafe.svg");
        fs::write(&svg, "<svg onload=\"alert(1)\"/>").unwrap();
        let scope = ImageScope::default();
        scope.allow_document(md.to_str().unwrap()).unwrap();
        let request = Request::builder()
            .uri(image_url(&svg))
            .body(Vec::new())
            .unwrap();
        let response = handle_image_protocol(&scope, &request);
        assert_eq!(response.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
    }

    #[test]
    fn protocol_refuses_non_image_files_inside_the_document_directory() {
        let (md, _) = temp_fixture();
        let secret = md.parent().unwrap().join("secret.txt");
        fs::write(&secret, "do not serve me").unwrap();
        let scope = ImageScope::default();
        scope.allow_document(md.to_str().unwrap()).unwrap();
        let request = Request::builder()
            .uri(image_url(&secret))
            .body(Vec::new())
            .unwrap();
        let response = handle_image_protocol(&scope, &request);
        assert_eq!(response.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
    }

    #[test]
    fn resolve_rejects_non_image_extensions_early() {
        let (md, _) = temp_fixture();
        let secret = md.parent().unwrap().join("notes.json");
        fs::write(&secret, "{}").unwrap();
        let scope = ImageScope::default();
        assert!(scope.resolve(md.to_str().unwrap(), "notes.json").is_err());
    }

    #[test]
    fn base64_matches_rfc4648_vectors() {
        let cases: &[(&[u8], &str)] = &[
            (b"", ""),
            (b"f", "Zg=="),
            (b"fo", "Zm8="),
            (b"foo", "Zm9v"),
            (b"foob", "Zm9vYg=="),
            (b"fooba", "Zm9vYmE="),
            (b"foobar", "Zm9vYmFy"),
        ];
        for (input, expected) in cases {
            assert_eq!(base64_encode(input), *expected);
        }
    }

    #[test]
    fn inlines_registered_images_and_skips_external_urls() {
        let (md, img) = temp_fixture();
        let scope = ImageScope::default();
        let root = scope.allow_document(md.to_str().unwrap()).unwrap();

        let local = image_data_url(&scope, &root, "image.png").unwrap();
        assert_eq!(local.0, "image.png");
        assert_eq!(local.1, "data:image/png;base64,iVBORw==");

        assert!(image_data_url(&scope, &root, "https://example.com/a.png").is_none());
        assert!(image_data_url(&scope, &root, "data:image/png;base64,AAAA").is_none());
        assert!(image_data_url(&scope, &root, "missing.png").is_none());

        let outside = std::env::temp_dir().join("mdpp-inline-outside.png");
        fs::write(&outside, b"x").unwrap();
        assert!(image_data_url(&scope, &root, outside.to_str().unwrap()).is_none());
        assert!(fs::metadata(img).is_ok());
    }

    #[test]
    fn percent_decode_does_not_panic_on_non_ascii_after_percent() {
        assert_eq!(percent_decode("图%片.png").unwrap(), "图%片.png");
        assert_eq!(percent_decode("%E5%9B%BE.png").unwrap(), "图.png");
        assert_eq!(percent_decode("a%2Fb.png").unwrap(), "a/b.png");
    }

    #[test]
    fn external_schemes_are_case_insensitive_without_panicking_on_non_ascii() {
        assert!(is_external_image("HTTPS://example.com/a.png"));
        assert!(is_external_image("HtTp://example.com/a.png"));
        assert!(is_external_image("DATA:image/png;base64,AAAA"));
        assert!(!is_external_image("图片.png"));
        assert!(!is_external_image("相对/路径.png"));
    }
}
