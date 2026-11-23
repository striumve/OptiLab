@echo off
setlocal
chcp 65001 >nul
title OptiLab
pushd "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。请安装 Node.js 22.12 或更新版本，然后重新双击此文件。
  pause
  popd
  exit /b 1
)
node "scripts\launch.mjs"
set "OPTILAB_EXIT=%ERRORLEVEL%"
if not "%OPTILAB_EXIT%"=="0" (
  echo.
  echo 启动未成功，请保留上方错误信息。
  pause
)
popd
exit /b %OPTILAB_EXIT%
