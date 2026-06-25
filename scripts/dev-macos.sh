#!/usr/bin/env bash
set -euo pipefail

# ========================================
#   MD++ macOS 开发环境启动脚本
#   Usage: bash scripts/dev-macos.sh [options]
#     --skip-install   跳过依赖安装(假定 node_modules 已存在)
#     --check-only     仅检查环境,不启动开发服务
#     -h, --help       显示帮助
# ========================================

# 切到仓库根目录
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DEV_URL="http://127.0.0.1:14300"
PORT=14300

SKIP_INSTALL=0
CHECK_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install) SKIP_INSTALL=1; shift ;;
    --check-only)   CHECK_ONLY=1;   shift ;;
    -h|--help)
      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "未知参数: $1 (使用 -h 查看帮助)"
      exit 1
      ;;
  esac
done

# --- 步骤标题 ---
step() {
  echo ""
  echo "==> $1"
}

# --- 命令检查 ---
assert_cmd() {
  local name="$1"
  local hint="$2"
  if ! command -v "$name" &>/dev/null; then
    echo "  ✗ 缺少命令 '$name'。$hint"
    exit 1
  fi
}

# --- 环境检查 ---
step "检查开发工具"
assert_cmd "node"  "请安装 Node.js 20 或更新版本。"
assert_cmd "pnpm"  "请安装 pnpm: npm install -g pnpm"
assert_cmd "cargo" "请安装 Rust stable: https://www.rust-lang.org/tools/install"

echo "  ✓ Node:  $(node --version)"
echo "  ✓ pnpm:  $(pnpm --version)"
echo "  ✓ Cargo: $(cargo --version)"

# macOS 特定:检查 Xcode Command Line Tools
if [[ "$(uname)" == "Darwin" ]]; then
  if xcode-select -p &>/dev/null; then
    echo "  ✓ Xcode Command Line Tools"
  else
    echo "  ✗ Xcode Command Line Tools 未安装,请运行: xcode-select --install"
    exit 1
  fi
fi

# --- 依赖安装 ---
if [[ ! -d "$REPO_ROOT/node_modules" ]]; then
  if [[ "$SKIP_INSTALL" -eq 1 ]]; then
    echo ""
    echo "node_modules 缺失。请去掉 --skip-install 参数,或先手动运行 'pnpm install'。"
    exit 1
  fi
  step "安装前端依赖"
  pnpm install
else
  echo ""
  echo "node_modules 已存在,跳过依赖安装。"
fi

step "使用 Tauri dev URL: $DEV_URL"

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  echo "检查完成。运行 scripts/dev-macos.sh 以开发模式启动 md++。"
  exit 0
fi

# --- 端口检查 / 释放 ---
step "检查端口 $PORT"
PORT_PID="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "$PORT_PID" ]]; then
  echo "端口 $PORT 被 PID $PORT_PID 占用 —— 终止僵尸进程..."
  if kill -9 "$PORT_PID" 2>/dev/null; then
    sleep 1
    echo "端口已释放。"
  else
    echo "无法终止 PID $PORT_PID(权限不足?),请手动处理后再试。"
    exit 1
  fi
else
  echo "端口 $PORT 空闲。"
fi

# --- 启动开发服务 ---
step "启动 md++ 开发应用"
pnpm tauri dev
