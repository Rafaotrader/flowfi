@echo off
echo.
echo  UNI Fee Miner -- Liberando portas 5000 e 6000...
echo.

:: Porta 5000
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /R ":5000 "') do (
  if not "%%a"=="" (
    echo  Encerrando processo na porta 5000: PID %%a
    taskkill /PID %%a /F >nul 2>&1
  )
)

:: Porta 6000
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /R ":6000 "') do (
  if not "%%a"=="" (
    echo  Encerrando processo na porta 6000: PID %%a
    taskkill /PID %%a /F >nul 2>&1
  )
)

echo.
echo  Portas liberadas. Agora rode:
echo    Terminal 1: cd backend  ^&^& npm run dev
echo    Terminal 2: cd frontend ^&^& npm run dev
echo.
pause
