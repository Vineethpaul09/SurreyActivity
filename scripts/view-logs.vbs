' ============================================================
'  Surrey Booking Scheduler - Open Latest Log
'  Double-click this to open the latest log file in Notepad.
' ============================================================

Set objFSO = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

scriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
projectDir = objFSO.GetParentFolderName(scriptDir)
logDir = projectDir & "\logs"

If Not objFSO.FolderExists(logDir) Then
    MsgBox "Log directory not found: " & logDir, 48, "No Logs"
    WScript.Quit
End If

' Find the latest .log file
Set logFolder = objFSO.GetFolder(logDir)
latestDate = #1/1/2000#
latestFile = ""

For Each f In logFolder.Files
    If LCase(objFSO.GetExtensionName(f.Name)) = "log" Then
        If f.DateLastModified > latestDate Then
            latestDate = f.DateLastModified
            latestFile = f.Path
        End If
    End If
Next

If latestFile = "" Then
    MsgBox "No .log files found in: " & logDir, 48, "No Logs"
Else
    WshShell.Run "notepad """ & latestFile & """", 1, False
End If
