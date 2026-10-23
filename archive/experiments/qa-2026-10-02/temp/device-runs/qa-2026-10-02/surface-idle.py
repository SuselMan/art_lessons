import subprocess,base64
script='''Add-Type -TypeDefinition @"
using System;using System.Runtime.InteropServices;public class QaIdle { [StructLayout(LayoutKind.Sequential)]public struct LASTINPUTINFO {public uint cbSize;public uint dwTime;}[DllImport("user32.dll")]public static extern bool GetLastInputInfo(ref LASTINPUTINFO p);public static uint IdleMs(){var p=new LASTINPUTINFO();p.cbSize=(uint)Marshal.SizeOf(p);GetLastInputInfo(ref p);return unchecked((uint)Environment.TickCount-p.dwTime);}}
"@;[PSCustomObject]@{IdleSeconds=[QaIdle]::IdleMs()/1000;Session=(Get-Process -Id $PID).SessionId}|ConvertTo-Json;powercfg /query SCHEME_CURRENT SUB_VIDEO VIDEOIDLE;powercfg /requests'''
encoded=base64.b64encode(script.encode('utf-16le')).decode();r=subprocess.run(['ssh','-oBatchMode=yes','surface','powershell.exe','-NoProfile','-EncodedCommand',encoded],capture_output=True,text=True,errors='replace',timeout=30);print(r.stdout);print('exit',r.returncode)
