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

; 自定义托盘图标
CustomIcon = %A_ScriptDir%/img/Tools.ico
IfExist, %CustomIcon%
Menu, Tray, Icon, %CustomIcon%

; 天锐绿盾
Menu, LdServiceMenu, Add, Enable, LdServiceStartMenuHandler
Menu, LdServiceMenu, Add, Disable, LdServiceStopMenuHandler
Menu, Tray, Add, LdTerm, :LdServiceMenu
; WSL
Menu, Tray, Add,
Menu, WslSubmenu, Add, Nginx, WslNginxMenuHandler
Menu, WslSubmenu, Add, Test, ExitMenuHandler
Menu, Tray, Add, WSL, :WslSubmenu
; 退出
Menu, Tray, Add,
Menu, Tray, Add, 退出, ExitMenuHandler

; 接管 Ctrl + Space，转到活动窗口
^Space::ControlSend, , ^{Space}, A
; x
return

LdServiceStartMenuHandler:
    RunWait, cmd /c start /min "" PowerShell -WindowStyle Hidden -ExecutionPolicy Bypass -C "net start ldcore"
    TrayTip, , 启动成功, 1,
    Menu, LdServiceMenu, Check, Enable
    Menu, LdServiceMenu, UnCheck, Disable
return

LdServiceStopMenuHandler:
    RunWait, cmd /c start /min "" PowerShell -WindowStyle Hidden -ExecutionPolicy Bypass -C "net stop ldcore"
    TrayTip, , 停止成功, 1,
    Menu, LdServiceMenu, Check, Disable
    Menu, LdServiceMenu, UnCheck, Enable
return

WslNginxMenuHandler:
    RunWait, cmd /c start /min "" PowerShell -WindowStyle Hidden -ExecutionPolicy Bypass -C "wsl -d Debian -u root service nginx start"
return

ExitMenuHandler:
    exitapp
return
