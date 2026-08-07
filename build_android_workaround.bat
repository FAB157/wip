@echo off
set TMP_DIR=C:\Users\HP\Desktop\tmp_capacitor
set TARGET_DIR=C:\Users\HP\Desktop\ITA IN TAS\itainta

echo Creating temp dir...
if not exist "%TMP_DIR%" mkdir "%TMP_DIR%"

echo Copying files...
copy "%TARGET_DIR%\package.json" "%TMP_DIR%\"
copy "%TARGET_DIR%\capacitor.config.ts" "%TMP_DIR%\"

echo Navigating to temp dir...
cd /d "%TMP_DIR%"

echo Installing capacitor...
call npm.cmd install @capacitor/core @capacitor/android @capacitor/cli

echo Creating dist dir...
if not exist "dist" mkdir dist

echo Adding android platform...
call npx cap add android

echo Copying android folder back to project...
xcopy /E /I /Y android "%TARGET_DIR%\android"

echo Done!
