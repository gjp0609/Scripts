#NoEnv
#SingleInstance force
#Persistent ; 让脚本持续运行, 直到用户退出.
DetectHiddenWindows, On
Menu, Tray, NoMainWindow
Menu, Tray, NoStandard
Menu, Tray, Tip, Tools

; 以 Admin 启动
full_command_line := DllCall("GetCommandLine", "str")
if not (A_IsAdmin or RegExMatch(full_command_line, " /restart(?!\S)"))
{
    try
    {
        if A_IsCompiled
            Run *RunAs "%A_ScriptFullPath%" /restart
        else
            Run *RunAs "%A_AhkPath%" /restart "%A_ScriptFullPath%"
    }
    ExitApp
}
while true
{
    TrayTip, , test, 1,
    Sleep, 1000
}
ExitMenuHandler:
    exitapp
return
