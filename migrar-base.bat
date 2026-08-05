@echo off
chcp 65001 >nul
echo.
echo ==========================================
echo   MIGRACION MotoVerso: XAMPP → Seenode
echo ==========================================
echo.
echo Este script exportara tu base de datos local
echo de XAMPP y la importara a Seenode.
echo.

REM Ruta de XAMPP (ajustar si es diferente)
set XAMPP_MYSQL=C:\xampp\mysql\bin

REM Verificar que XAMPP existe
if not exist "%XAMPP_MYSQL%\mysqldump.exe" (
  echo ❌ No se encontro XAMPP en %XAMPP_MYSQL%
  echo Ajusta la ruta en este script si tu XAMPP esta en otro lado.
  pause
  exit /b 1
)

REM Configuracion LOCAL (XAMPP)
set LOCAL_HOST=localhost
set LOCAL_USER=root
set LOCAL_DB=motoverso

REM Configuracion SEENODE (produccion)
set REMOTE_HOST=up-de-fra1-mysql-2.db.run-on-seenode.com
set REMOTE_PORT=11550
set REMOTE_USER=db_nxxznajr8pzx
set REMOTE_DB=db_nxxznajr8pzx

REM Archivo temporal de backup
set BACKUP_FILE=motoverso_backup_%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%.sql
set BACKUP_FILE=%BACKUP_FILE: =0%

echo 📋 Configuracion:
echo    Local:  %LOCAL_HOST% / %LOCAL_USER% / %LOCAL_DB%
echo    Remoto: %REMOTE_HOST%:%REMOTE_PORT% / %REMOTE_USER% / %REMOTE_DB%
echo.

REM Paso 1: Exportar base local
echo 🔵 PASO 1: Exportando base local (%LOCAL_DB%)...
echo    Archivo: %BACKUP_FILE%
"%XAMPP_MYSQL%\mysqldump.exe" -h %LOCAL_HOST% -u %LOCAL_USER% --databases %LOCAL_DB% --routines --events > %BACKUP_FILE%

if %errorlevel% neq 0 (
  echo ❌ Error exportando base local.
  echo    Verifica que MySQL de XAMPP este corriendo.
  pause
  exit /b 1
)

echo ✅ Exportado correctamente: %BACKUP_FILE%
echo.

REM Paso 2: Importar a Seenode
echo 🔵 PASO 2: Importando a Seenode...
echo    Se pedira la contrasena de la base de datos de Seenode.
echo    (Copiala desde el panel de Seenode - pestana Base de datos)
echo.
"%XAMPP_MYSQL%\mysql.exe" -h %REMOTE_HOST% -P %REMOTE_PORT% -u %REMOTE_USER% -p %REMOTE_DB% < %BACKUP_FILE%

if %errorlevel% neq 0 (
  echo ❌ Error importando a Seenode.
  echo    Verifica la contrasena y la conexion.
  pause
  exit /b 1
)

echo ✅ Importado correctamente a Seenode!
echo.
echo ==========================================
echo    MIGRACION COMPLETADA
echo ==========================================
echo.
echo Tu app deberia funcionar ahora en:
echo    https://prueba.seenode.app
echo.
echo Los usuarios y contrasenas son los mismos
echo que usabas en tu XAMPP local.
echo.
pause
