@echo off
echo Avvio Mass Enrichment in Loop...
:loop
node --experimental-strip-types scripts/mass_enrich_background.ts
echo.
echo =======================================================
echo Il processo si e' interrotto o e' crashato.
echo Riavvio automatico in 5 secondi per non fermarsi mai...
echo =======================================================
timeout /t 5
goto loop
