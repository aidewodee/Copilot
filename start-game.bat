@echo off
setlocal
cd /d "%~dp0"

where.exe npm >nul 2>nul
if errorlevel 1 (
  echo Node.js and npm are required to run Rocket Rally.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo Installing game dependencies...
  call npm install
  if errorlevel 1 goto :error
)

powershell.exe -NoProfile -Command "try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:5174/' -TimeoutSec 2 -UseBasicParsing; if ($response.Content -match 'Rocket Rally') { exit 0 } } catch { }; exit 1"
if errorlevel 1 (
  echo Starting Rocket Rally...
  start "Rocket Rally server" /D "%~dp0" cmd /k "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort"
)

powershell.exe -NoProfile -Command "$url = 'http://127.0.0.1:5174/'; for ($i = 0; $i -lt 30; $i++) { try { $response = Invoke-WebRequest -Uri $url -TimeoutSec 1 -UseBasicParsing; if ($response.Content -match 'Rocket Rally') { exit 0 } } catch { }; Start-Sleep -Seconds 1 }; exit 1"
if errorlevel 1 goto :server_error

start "" "http://127.0.0.1:5174/"
exit /b 0

:server_error
echo Rocket Rally did not start. Check the server window for errors.
pause
exit /b 1

:error
echo Could not install game dependencies.
pause
exit /b 1
