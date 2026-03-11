' ============================================================
'  Surrey Booking Scheduler - Status Checker
'  Double-click this to see if the scheduler is running.
' ============================================================
Option Explicit

Dim WshShell, objFSO, objWMI, colProcesses, objProcess
Dim scriptDir, projectDir, logDir
Dim nodeRunning, nodePID, cmdLine
Dim latestLogName, latestLogDate, latestLogLines, latestFile
Dim logFolder, f, latestDate
Dim objExec, taskOutput, taskState
Dim msg, icon, title, ts, lineText
Dim lines(), lineCount, startLine, i
Dim adoStream, allText, splitLines, tempFile

Set WshShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Get project directory
scriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
projectDir = objFSO.GetParentFolderName(scriptDir)
logDir = projectDir & "\logs"

' Check if node.exe is running
Set objWMI = GetObject("winmgmts:\\.\root\cimv2")
Set colProcesses = objWMI.ExecQuery("SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'node.exe'")

nodeRunning = False
nodePID = ""
For Each objProcess In colProcesses
    cmdLine = ""
    On Error Resume Next
    cmdLine = objProcess.CommandLine
    On Error GoTo 0
    If Len(cmdLine) > 0 Then
        If InStr(LCase(cmdLine), "scheduler") > 0 Then
            nodeRunning = True
            nodePID = CStr(objProcess.ProcessId)
        End If
    End If
Next

' Get latest log file info
latestLogName = ""
latestLogDate = ""
latestLogLines = ""
latestFile = ""
latestDate = CDate("2000/01/01")

If objFSO.FolderExists(logDir) Then
    Set logFolder = objFSO.GetFolder(logDir)
    For Each f In logFolder.Files
        If LCase(objFSO.GetExtensionName(f.Name)) = "log" Then
            If f.DateLastModified > latestDate Then
                latestDate = f.DateLastModified
                latestLogName = f.Name
                latestLogDate = CStr(f.DateLastModified)
                latestFile = f.Path
            End If
        End If
    Next

    ' Read last 5 lines from the latest log file (UTF-8, copy first to avoid lock)
    If latestFile <> "" Then
        tempFile = projectDir & "\logs\~status-check-temp.log"
        On Error Resume Next
        objFSO.CopyFile latestFile, tempFile, True
        If Err.Number = 0 Then
            On Error GoTo 0

            Set adoStream = CreateObject("ADODB.Stream")
            adoStream.Type = 2  ' Text
            adoStream.Charset = "utf-8"
            adoStream.Open
            adoStream.LoadFromFile tempFile
            allText = adoStream.ReadText(-1)
            adoStream.Close
            Set adoStream = Nothing

            ' Delete temp file
            On Error Resume Next
            objFSO.DeleteFile tempFile, True
            On Error GoTo 0

            ' Split into lines
            splitLines = Split(allText, vbLf)
            lineCount = UBound(splitLines)

            startLine = lineCount - 5
            If startLine < 0 Then startLine = 0
            latestLogLines = ""
            For i = startLine To lineCount
                lineText = Replace(splitLines(i), vbCr, "")
                If Len(lineText) > 0 Then
                    latestLogLines = latestLogLines & lineText & vbCrLf
                End If
            Next
        Else
            On Error GoTo 0
            latestLogLines = "(Could not read log - file in use)" & vbCrLf
        End If
    End If
End If

' Check Task Scheduler
taskState = "NOT INSTALLED"
On Error Resume Next
Set objExec = WshShell.Exec("schtasks /query /tn SurreyActivityBookingScheduler /fo csv /nh")
If Err.Number = 0 Then
    taskOutput = ""
    Do While Not objExec.StdOut.AtEndOfStream
        taskOutput = taskOutput & objExec.StdOut.ReadLine()
    Loop
    If InStr(taskOutput, "Running") > 0 Then
        taskState = "RUNNING"
    ElseIf InStr(taskOutput, "Ready") > 0 Then
        taskState = "READY (waiting for trigger)"
    ElseIf InStr(taskOutput, "Disabled") > 0 Then
        taskState = "DISABLED"
    End If
End If
On Error GoTo 0

' Build status message
msg = "========================================" & vbCrLf
msg = msg & "  SURREY BOOKING SCHEDULER STATUS" & vbCrLf
msg = msg & "========================================" & vbCrLf & vbCrLf

msg = msg & "Task Scheduler:  " & taskState & vbCrLf

If nodeRunning Then
    msg = msg & "Node Process:    RUNNING (PID " & nodePID & ")" & vbCrLf
Else
    msg = msg & "Node Process:    NOT RUNNING" & vbCrLf
End If

msg = msg & vbCrLf

If latestLogName <> "" Then
    msg = msg & "Latest Log:      " & latestLogName & vbCrLf
    msg = msg & "Last Updated:    " & latestLogDate & vbCrLf
    msg = msg & vbCrLf & "--- Recent Log ---" & vbCrLf
    msg = msg & latestLogLines
Else
    msg = msg & "No log files found." & vbCrLf
End If

' Determine icon - 64 = Info, 48 = Warning
If nodeRunning Then
    icon = 64  ' Info icon (blue)
    title = "Scheduler is RUNNING"
Else
    icon = 48  ' Warning icon (yellow)
    title = "Scheduler is NOT RUNNING"
End If

MsgBox msg, icon, title
