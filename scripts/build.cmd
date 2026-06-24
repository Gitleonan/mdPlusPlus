@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0.."

echo ========================================
echo   MD++ Build Script
echo ========================================
echo.

:: read current version from package.json
for /f %%v in ('node -p "require('./package.json').version"') do set PKG_VER=%%v

echo Current version: !PKG_VER!
echo.

set /p INPUT_VER="Enter release version (press Enter to use !PKG_VER!): "
if "!INPUT_VER!"=="" set INPUT_VER=!PKG_VER!

echo.
echo ========================================
echo Building MD++ v!INPUT_VER!
echo Targets: nsis + msi
echo ========================================
echo.

set /p CONFIRM="Confirm build? (y/N): "
if /i not "!CONFIRM!"=="y" (
  echo Build cancelled.
  pause
  exit /b 0
)

:: ============================================
:: Step 1: Sync version
:: ============================================
echo.
echo [1/3] Syncing version (source: package.json)...

if not "!INPUT_VER!"=="!PKG_VER!" (
  echo   Updating package.json: !PKG_VER! -^> !INPUT_VER!
  node -e "const fs=require('fs'),p=JSON.parse(fs.readFileSync('package.json','utf8'));p.version='!INPUT_VER!';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\r\n')"
)

call pnpm sync-version
if %ERRORLEVEL% neq 0 (
  echo   ERROR: Version sync failed!
  pause
  exit /b %ERRORLEVEL%
)
echo   All files synced to v!INPUT_VER!

:: ============================================
:: Step 2: Build app + NSIS installer
:: ============================================
echo.
echo [2/3] Building app + NSIS installer...

:: clean old nsis output to avoid conflicts
if exist "src-tauri\target\release\bundle\nsis" rmdir /s /q "src-tauri\target\release\bundle\nsis" 2>nul
if exist "src-tauri\target\release\nsis" rmdir /s /q "src-tauri\target\release\nsis" 2>nul

:: Tauri builds frontend + Rust + NSIS in one go
call pnpm tauri build --bundles nsis
set BUILD_ERR=%ERRORLEVEL%

:: check if NSIS output exists regardless of exit code
set OUT_NSIS=
for %%f in ("src-tauri\target\release\bundle\nsis\*.exe") do set OUT_NSIS=%%f
if "!OUT_NSIS!"=="" (
  for %%f in ("src-tauri\target\release\bundle\nsis\*setup*.exe") do set OUT_NSIS=%%f
)

if "!OUT_NSIS!"=="" (
  echo   ERROR: NSIS build failed (exit code: %BUILD_ERR%).
  echo   No .exe found in bundle\nsis\
  pause
  exit /b 1
)
echo   NSIS: !OUT_NSIS!

:: ============================================
:: Step 3: Build MSI installer (manual WiX)
:: ============================================
echo.
echo [3/3] Building MSI installer...

set WIX_DIR=%LOCALAPPDATA%\tauri\WixTools314
if not exist "%WIX_DIR%\light.exe" (
  echo   WiX tools not found at %WIX_DIR%\light.exe
  echo   Skipping MSI. Install Tauri CLI to enable MSI builds.
  goto :done
)

set BUNDLE_DIR=src-tauri\target\release
set WIX_SRC=%BUNDLE_DIR%\wix\x64

:: clean old wix output
if exist "%BUNDLE_DIR%\wix" rmdir /s /q "%BUNDLE_DIR%\wix" 2>nul
if exist "%BUNDLE_DIR%\bundle\msi" rmdir /s /q "%BUNDLE_DIR%\bundle\msi" 2>nul

:: let Tauri generate WiX source files (app already built, this is fast)
echo   Generating WiX source files...
call pnpm tauri build --bundles msi >nul 2>&1

if not exist "%WIX_SRC%\main.wxs" (
  echo   ERROR: main.wxs not generated. Skipping MSI.
  goto :done
)

:: patch desktop shortcut to use ProductIcon explicitly
echo   Patching desktop shortcut icon...
node scripts\patch-wxs.mjs "%WIX_SRC%\main.wxs" 2>nul

:: ensure output dir exists and no stale .wixobj
if not exist "%WIX_SRC%" mkdir "%WIX_SRC%"
if exist "%WIX_SRC%\main.wixobj" del "%WIX_SRC%\main.wixobj"

:: run candle.exe (compile .wxs -> .wixobj)
echo   Running candle.exe...
"%WIX_DIR%\candle.exe" -arch x64 -dBuildVersion="!INPUT_VER!" -out "%WIX_SRC%\\" "%WIX_SRC%\main.wxs"
if %ERRORLEVEL% neq 0 (
  echo   ERROR: candle.exe failed!
  pause
  exit /b %ERRORLEVEL%
)

:: fix locale codepage for Chinese (936 instead of 1252)
set WXL=%WIX_SRC%\locale.wxl
if exist "%WXL%" (
  echo   Fixing locale codepage to 936...
  node scripts\fix-locale.mjs "%WXL%" 2>nul
)

:: run light.exe (link .wixobj -> .msi)
echo   Running light.exe...
set OUT_MSI=%BUNDLE_DIR%\bundle\msi\md++_!INPUT_VER!_x64_en-US.msi
if not exist "%BUNDLE_DIR%\bundle\msi" mkdir "%BUNDLE_DIR%\bundle\msi"

"%WIX_DIR%\light.exe" ^
  -ext "%WIX_DIR%\WixUIExtension.dll" ^
  -loc "%WXL%" ^
  -out "%OUT_MSI%" ^
  "%WIX_SRC%\main.wixobj"

if %ERRORLEVEL% neq 0 (
  echo   ERROR: light.exe failed!
  pause
  exit /b %ERRORLEVEL%
)
echo   MSI: %OUT_MSI%

:: ============================================
:: Done
:: ============================================
:done
echo.
echo ========================================
echo   Build complete: v%INPUT_VER%
if not "!OUT_NSIS!"=="" echo   NSIS: !OUT_NSIS!
if exist "%OUT_MSI%"           echo   MSI:  %OUT_MSI%
echo ========================================

pause
endlocal
