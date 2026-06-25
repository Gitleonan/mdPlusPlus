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
echo Targets: nsis
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
echo [1/2] Syncing version (source: package.json)...

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
echo [2/2] Building app + NSIS installer...

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
  echo.
  echo   ERROR: NSIS build failed (exit code: %BUILD_ERR%).
  echo   No .exe found in bundle\nsis\
  echo.
  pause
  exit /b 1
)

:: resolve absolute path of the installer
for %%I in ("!OUT_NSIS!") do set OUT_NSIS_ABS=%%~fI

echo.
echo   NSIS: !OUT_NSIS_ABS!

:: ============================================
:: Done
:: ============================================
:done
echo.
echo ========================================
echo   Build complete: v%INPUT_VER%
if not "!OUT_NSIS_ABS!"=="" (
  echo.
  echo   Output: !OUT_NSIS_ABS!
)
echo ========================================
echo.
echo Press ENTER to open the output folder, or ESC to exit...

:: 用 PowerShell 读取单次按键：Enter -> exit 0, Escape -> exit 1, 其它 -> exit 2
powershell -NoProfile -Command "$k=[Console]::ReadKey($true).Key; if($k -eq 'Enter'){exit 0}elseif($k -eq 'Escape'){exit 1}else{exit 2}" >nul 2>&1
set KEY_ERR=!ERRORLEVEL!

if "!KEY_ERR!"=="0" goto open_folder
if "!KEY_ERR!"=="1" goto end
echo Unrecognized key, ignoring.
goto end

:open_folder
if not "!OUT_NSIS_ABS!"=="" (
  explorer.exe /select,"!OUT_NSIS_ABS!"
  echo Folder opened.
) else (
  echo No output file to open.
)

:end
endlocal
