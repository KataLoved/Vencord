@echo off
setlocal enabledelayedexpansion

for /f %%i in ('tasklist ^| findstr /I "Discord.exe"') do (
   taskkill /F /IM Discord.exe /T
)

exit /b