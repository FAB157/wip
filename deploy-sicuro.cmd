@echo off
rem DEPLOY SICURO (22/11/2026): banco, import, prova di caricamento, conferma SI, deploy, controllo, ritorno indietro automatico.
rem Doppio clic. Si puo' tenere anche sul desktop: lavora sempre nella cartella del progetto.
cd /d C:\progetti\itainta || (echo Cartella C:\progetti\itainta non trovata & pause & exit /b 1)
node scripts\deploy-sicuro.mjs %*
echo.
pause
