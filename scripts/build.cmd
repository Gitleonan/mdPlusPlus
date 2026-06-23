@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: 先切到仓库根目录
cd /d "%~dp0.."

echo ========================================
echo   MD++ 打包构建脚本
echo ========================================
echo.

:: 读取当前 package.json 版本号
for /f %%v in ('node -p "require('./package.json').version"') do set PKG_VER=%%v

echo 当前版本: !PKG_VER!
echo.

:: 询问版本号
set /p INPUT_VER="请输入要发布的版本号 (直接回车使用 !PKG_VER!): "
if "!INPUT_VER!"=="" set INPUT_VER=!PKG_VER!

echo.
echo ========================================
echo 即将构建 MD++ v!INPUT_VER!
echo 目标: msi + nsis 安装包
echo ========================================
echo.

set /p CONFIRM="确认构建? (y/N): "
if /i not "!CONFIRM!"=="y" (
  echo 已取消构建。
  exit /b 0
)

echo.
echo [1/4] 同步版本号...

:: 用 node 更新版本号（避免 PowerShell ConvertTo-Json 破坏编码）
if not "!INPUT_VER!"=="!PKG_VER!" (
  echo   更新 package.json: !PKG_VER! -^> !INPUT_VER!
  node -e "const fs=require('fs'),p=JSON.parse(fs.readFileSync('package.json','utf8'));p.version='!INPUT_VER!';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\r\n')"
)

:: 同步 tauri.conf.json 版本号
node -e "const fs=require('fs'),t=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));t.version='!INPUT_VER!';fs.writeFileSync('src-tauri/tauri.conf.json',JSON.stringify(t,null,2)+'\r\n')"
echo   已同步 tauri.conf.json 版本号: !INPUT_VER!

:: 同步 Cargo.toml 版本号
call pnpm sync-version
if %ERRORLEVEL% neq 0 (
  echo   版本同步失败! 错误码: %ERRORLEVEL%
  exit /b %ERRORLEVEL%
)
echo   已同步 Cargo.toml 版本号: !INPUT_VER!

echo [2/4] 清理旧的构建产物...
if exist "src-tauri\target\release\bundle\msi" rmdir /s /q "src-tauri\target\release\bundle\msi" 2>nul
if exist "src-tauri\target\release\wix"      rmdir /s /q "src-tauri\target\release\wix"      2>nul

echo [3/4] 编译 Rust 后端 + 前端...
call pnpm build
if %ERRORLEVEL% neq 0 (
  echo   前端构建失败!
  exit /b %ERRORLEVEL%
)
echo   前端构建成功。

echo   编译 Rust 后端 (release)...
cargo build --release --manifest-path src-tauri\Cargo.toml
if %ERRORLEVEL% neq 0 (
  echo   Rust 编译失败!
  exit /b %ERRORLEVEL%
)
echo   Rust 编译成功。

echo [4/4] 打包 MSI 安装包...

:: 找到 WiX 工具路径
set WIX_DIR=%LOCALAPPDATA%\tauri\WixTools314
if not exist "%WIX_DIR%\light.exe" (
  echo   错误: 找不到 WiX 工具! 请安装 Tauri CLI 后重试。
  echo   路径: %WIX_DIR%\light.exe
  exit /b 1
)

:: 生成 WiX 文件 (tauri bundler 的 candle/light 前置步骤)
:: 先用 tauri build --bundles 仅编译不打包
:: 然后手动运行 candle + light
set BUNDLE_DIR=src-tauri\target\release
set WIX_SRC=%BUNDLE_DIR%\wix\x64

echo   正在准备 WiX 源文件...
:: 调用 Tauri 生成 WiX 配置（candle + light 文件）
call pnpm tauri build --bundles msi 2>&1 | findstr /v "failed light.exe"

:: 如果上面失败（WiX 步骤失败），我们手动构建 MSI
if not exist "%WIX_SRC%\main.wixobj" (
  echo   Tauri 未生成 .wixobj，尝试直接通过 cargo-bundle...

  :: 使用 tauri-bundler 或手动 candle
  if exist "%WIX_SRC%\main.wxs" (
    echo   运行 candle.exe...
    "%WIX_DIR%\candle.exe" -arch x64 -dBuildVersion="!INPUT_VER!" -out "%WIX_SRC%\" "%WIX_SRC%\main.wxs"
    if %ERRORLEVEL% neq 0 (
      echo   candle 失败!
      exit /b %ERRORLEVEL%
    )
  ) else (
    echo   错误: 找不到 main.wxs!
    exit /b 1
  )
)

:: 修复 locale.wxl 的 codepage（中文需要 936 而非 1252）
set WXL=%WIX_SRC%\locale.wxl
if exist "%WXL%" (
  echo   修复 WiX locale codepage 为 936 (支持中文)...
  powershell -NoProfile -Command ^
    "$xml=[xml](Get-Content '%WXL%');$xml.WixLocalization.Codepage='936';$xml.WixLocalization.SelectSingleNode('//*[local-name()=""String"" and @Id=""TauriCodepage""]').InnerText='936';$xml.Save('%WXL%')"
)

:: 运行 light.exe 生成 MSI
echo   运行 light.exe 生成 MSI...
set OUT_MSI=%BUNDLE_DIR%\bundle\msi\md++_!INPUT_VER!_x64_en-US.msi
if not exist "%BUNDLE_DIR%\bundle\msi" mkdir "%BUNDLE_DIR%\bundle\msi"

"%WIX_DIR%\light.exe" ^
  -ext "%WIX_DIR%\WixUIExtension.dll" ^
  -loc "%WXL%" ^
  -out "%OUT_MSI%" ^
  "%WIX_SRC%\main.wixobj"

if %ERRORLEVEL% neq 0 (
  echo.
  echo   light.exe 打包失败! 错误码: %ERRORLEVEL%
  exit /b %ERRORLEVEL%
)

echo.
echo ========================================
echo   构建完成! 版本: v!INPUT_VER!
echo   MSI: %OUT_MSI%
echo ========================================

endlocal
