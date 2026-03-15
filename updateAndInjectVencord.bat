@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting administrator privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%CD%' -ArgumentList '%*' -Verb RunAs"
    exit /b
)

setlocal

REM Run from repository root (directory of this script)
pushd "%~dp0"

echo [1/3] Updating repository from git...
git pull --ff-only
if errorlevel 1 (
    echo.
    echo Git update failed. Resolve git issues and try again.
    popd
    exit /b 1
)

echo.
echo [2/3] Running pnpm build...
call pnpm build
if errorlevel 1 (
    echo.
    echo pnpm build failed.
    popd
    exit /b 1
)

echo.
echo [3/3] Running pnpm inject...
call pnpm inject
if errorlevel 1 (
    echo.
    echo pnpm inject failed.
    popd
    exit /b 1
)

echo.
echo Done: repository updated, build completed, inject completed.

popd
exit /b 0
