' ============================================================
'  Surrey Activity Booking - Hidden Launcher (no visible window)
'  This VBScript launches the scheduler batch file invisibly.
'  Used by Windows Task Scheduler so there's no CMD window to close.
' ============================================================

Set WshShell = CreateObject("WScript.Shell")

' Get the directory this script is in (scripts\)
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
batchFile = scriptDir & "\run-scheduler.bat"

' Run hidden (0 = hidden window) and wait so Task Scheduler tracks the real process
WshShell.Run "cmd /c """ & batchFile & """", 0, True
