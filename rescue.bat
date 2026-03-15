@echo off

setlocal

REM Run from repository root (directory of this script)
pushd "%~dp0"

echo [1/4] Fetching latest from origin...
git fetch origin --prune
if errorlevel 1 (
    echo.
    echo Git fetch failed.
    popd
    exit /b 1
)

echo.
echo [2/4] Switching to main branch...
git checkout main
if errorlevel 1 (
    echo.
    echo Failed to switch to main branch.
    popd
    exit /b 1
)

echo.
echo [3/4] Discarding local tracked changes...
git reset --hard origin/main
if errorlevel 1 (
    echo.
    echo Failed to reset to origin/main.
    popd
    exit /b 1
)

echo.
echo [4/4] Removing untracked files and folders...
git clean -fd
if errorlevel 1 (
    echo.
    echo Failed to clean untracked files.
    popd
    exit /b 1
)

echo.
echo Done: local changes were discarded and repository was synced to origin/main.

popd
exit /b 0
