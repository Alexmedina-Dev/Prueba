@echo off
echo 🏍️  Iniciando MotoVerso...
echo.

:: Matar procesos node anteriores si existen
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

cd /d C:\MotoVerso\backend
echo ✅ Servidor iniciado en http://localhost:3000
echo 🛑 Presiona Ctrl+C para detener
echo.
node server.js