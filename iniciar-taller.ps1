Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   🏍️  MotoVerso — Inicio Rápido Taller   ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── 1. Verificar MySQL (XAMPP) ──────────────────────────
Write-Host "🔍 Verificando MySQL..." -ForegroundColor Yellow
$mysqlRunning = Get-Process -Name "mysqld" -ErrorAction SilentlyContinue
if (-not $mysqlRunning) {
    Write-Host "   ⚠️  MySQL no está corriendo. Iniciando XAMPP MySQL..." -ForegroundColor Yellow
    try {
        Start-Process -FilePath "C:\xampp\mysql\bin\mysqld.exe" -WindowStyle Hidden
        Write-Host "   ✅ MySQL iniciado" -ForegroundColor Green
    } catch {
        Write-Host "   ❌ Error al iniciar MySQL: $_" -ForegroundColor Red
        Write-Host "   Abre XAMPP Control Panel e inicia MySQL manualmente" -ForegroundColor Red
        pause
        exit
    }
} else {
    Write-Host "   ✅ MySQL ya está corriendo" -ForegroundColor Green
}

# ── 2. Matar servidor Node viejo ────────────────────────
Write-Host "🔍 Verificando servidor Node..." -ForegroundColor Yellow
$nodeOn3000 = netstat -ano | Select-String ":3000 " | Select-String "LISTENING"
if ($nodeOn3000) {
    $oldPid = ($nodeOn3000 -split '\s+')[-1]
    Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    Write-Host "   ✅ Servidor anterior detenido (PID $oldPid)" -ForegroundColor Green
} else {
    Write-Host "   ✅ No hay servidor previo" -ForegroundColor Green
}

# ── 3. Iniciar servidor Node ────────────────────────────
Write-Host "🚀 Iniciando servidor MotoVerso..." -ForegroundColor Yellow
$backendDir = Join-Path $PSScriptRoot "backend"
$logDir = Join-Path $backendDir "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

Start-Process -NoNewWindow -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $backendDir `
    -RedirectStandardOutput (Join-Path $backendDir "server-out.log") `
    -RedirectStandardError (Join-Path $backendDir "server-err.log")

Start-Sleep -Seconds 2

# Verificar que arrancó
$nodeCheck = netstat -ano | Select-String ":3000 " | Select-String "LISTENING"
if (-not $nodeCheck) {
    Write-Host "   ⚠️  Esperando servidor..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
    $nodeCheck = netstat -ano | Select-String ":3000 " | Select-String "LISTENING"
}

if ($nodeCheck) {
    Write-Host "   ✅ Servidor MotoVerso corriendo en puerto 3000" -ForegroundColor Green
} else {
    Write-Host "   ❌ El servidor no arrancó. Revisa server-err.log" -ForegroundColor Red
    pause
    exit
}

# ── 4. Obtener IP local ─────────────────────────────────
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "192.168.*" }).IPAddress | Select-Object -First 1
if (-not $ip) { $ip = "192.168.x.x" }

# ── 5. Abrir navegador ──────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          ✅  LISTO  ✅                    ║" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║                                          ║" -ForegroundColor Cyan
Write-Host "║   🖥️  Este PC:                           ║" -ForegroundColor White
Write-Host "║      http://localhost:3000               ║" -ForegroundColor White
Write-Host "║                                          ║" -ForegroundColor Cyan
Write-Host "║   📡 Otro PC (misma WiFi):               ║" -ForegroundColor White
Write-Host "║      http://$($ip):3000                   ║" -ForegroundColor White
Write-Host "║                                          ║" -ForegroundColor Cyan
Write-Host "║   👤 Usuario: admin@gmail.com            ║" -ForegroundColor Cyan
Write-Host "║   🔑 Password: admin1234                  ║" -ForegroundColor Cyan
Write-Host "║                                          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

Start-Process "http://localhost:3000"

Write-Host "Presiona ENTER para cerrar el servidor..." -ForegroundColor Gray
Read-Host

# ── Limpieza al cerrar ─────────────────────────────
Write-Host "Deteniendo servidor..." -ForegroundColor Yellow
$nodeProc = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProc) { $nodeProc | Stop-Process -Force }
Write-Host "✅ Servidor detenido. ¡Hasta luego!" -ForegroundColor Green
