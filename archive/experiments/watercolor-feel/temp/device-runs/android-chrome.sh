#!/bin/bash
# Restart Chrome on the Android tablet and open a room of the dev server.
# Usage: android-chrome.sh <room> [ip:port]   (ip:port defaults to the last one used)
A=~/tools/platform-tools/adb
DEV=${2:-$(cat temp/device-runs/android.adb 2>/dev/null)}
[ -n "$2" ] && echo "$2" > temp/device-runs/android.adb
$A connect "$DEV" >/dev/null 2>&1
$A -s "$DEV" shell svc power stayon true
$A -s "$DEV" shell am force-stop com.android.chrome
sleep 1
$A -s "$DEV" shell am start -a android.intent.action.VIEW -d "https://192.168.1.70:5277/room/$1?t=$(date +%s)" -p com.android.chrome >/dev/null
echo "chrome restarted on $DEV -> room $1"
