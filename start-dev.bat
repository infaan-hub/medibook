@echo off
echo Starting MediBook Development Environment...

REM Free the app port (default 3000)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Killing process %%a on port 3000...
    taskkill /PID %%a /F >nul 2>&1
)

timeout /t 2 /nobreak >nul

REM One process serves UI + API + WebSocket + SSE (frontend/server.js)
start "MediBook" cmd /k "cd /d E:\Medibook\frontend && npm run dev"

timeout /t 5 /nobreak >nul
start chrome "http://localhost:3000"

echo Done! App on http://localhost:3000
