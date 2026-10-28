@echo off
title PedeMuleke Spooler - Impressao Automatica
echo ===================================================
echo     Iniciando PedeMuleke Spooler Local...
echo ===================================================
if exist pedemuleke-spooler.exe (
    pedemuleke-spooler.exe
) else (
    node server.js
)
pause
