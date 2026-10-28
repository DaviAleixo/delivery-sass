@echo off
title Compilar PedeMuleke Spooler (.EXE)
echo =======================================================
echo    Compilando PedeMuleke Spooler em Executavel (.exe)
echo =======================================================
echo.
if not exist dist mkdir dist

echo [1/4] Empacotando codigo JS com esbuild...
call npx --yes esbuild server.js --bundle --platform=node --format=cjs --outfile=dist/spooler.cjs
if errorlevel 1 goto error

echo [2/4] Gerando blob SEA do Node.js...
node --experimental-sea-config sea-config.json
if errorlevel 1 goto error

echo [3/4] Preparando binario executavel Windows...
node -e "require('fs').copyFileSync(process.execPath, 'pedemuleke-spooler.exe')"
if errorlevel 1 goto error

echo [4/4] Injetando aplicacao no executavel...
call npx --yes postject pedemuleke-spooler.exe NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
if errorlevel 1 goto error

echo.
echo =======================================================
echo    SUCESSO! O arquivo pedemuleke-spooler.exe foi gerado!
echo =======================================================
goto end

:error
echo.
echo =======================================================
echo    Ocorreu uma falha na geracao do executavel.
echo =======================================================

:end
pause
