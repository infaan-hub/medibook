@echo off
echo Starting MediBook Development Environment...

REM Kill any process using port 8000 (Next.js backend)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    echo Killing process %%a on port 8000...
    taskkill /PID %%a /F >nul 2>&1
)

REM Wait for port to free up
timeout /t 2 /nobreak >nul

REM Start Next.js backend (API + WebSocket) in new CMD
start "MediBook Backend" cmd /k "cd /d E:\Medibook\next-app && npm run dev"

REM Start Frontend in new CMD
start "MediBook Frontend" cmd /k "cd /d E:\Medibook\frontend && npm run dev"

REM Wait a moment then open Chrome
timeout /t 3 /nobreak >nul
start chrome "http://localhost:5173"

echo Done! Two CMD windows opened.
