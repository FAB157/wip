#!/bin/bash
# Avvia subito il controllo «luoghi senza strada» e lo mette ogni notte alle 01:00 UTC.
cd /root/strade-extra || exit 1
sed -i 's/\r$//' script/luoghi-senza-strada.mjs
node --check script/luoghi-senza-strada.mjs || exit 1
nohup nice -n 15 node script/luoghi-senza-strada.mjs > senza-strada.log 2>&1 < /dev/null &
( crontab -l 2>/dev/null | grep -v luoghi-senza-strada
  echo '0 1 * * * cd /root/strade-extra && nice -n 15 node script/luoghi-senza-strada.mjs > senza-strada.log 2>&1' ) | crontab -
crontab -l | grep senza-strada
sleep 25
tail -2 senza-strada.log
