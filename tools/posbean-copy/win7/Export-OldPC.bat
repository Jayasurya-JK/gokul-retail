@echo off
rem Export-OldPC.bat - double-click this on the OLD POSBean PC (Windows 7).
rem It asks for Administrator permission, then runs Export-OldPC.ps1.
title Gokul Retail - export old POSBean PC (Windows 7)

net session >nul 2>&1
if errorlevel 1 (
  echo This needs Administrator permission. Windows will ask you now. Click Yes.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Export-OldPC.ps1"

echo.
pause
