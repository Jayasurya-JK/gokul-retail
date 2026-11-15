@echo off
rem Copy-OldPC.bat - double-click this on the OLD POSBean PC.
rem It asks for Administrator permission, then runs Copy-OldPC.ps1.
title Gokul Retail - copy old POSBean PC

net session >nul 2>&1
if errorlevel 1 (
  echo This needs Administrator permission. Windows will ask you now. Click Yes.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Copy-OldPC.ps1"

echo.
pause
