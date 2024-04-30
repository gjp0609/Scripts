#SingleInstance force
DetectHiddenWindows True
Persistent

CustomIcon := 'img/Tools.ico'
if FileExist(CustomIcon) {
    TraySetIcon(CustomIcon)
}
A_IconTip := 'Tools'

; 以 Admin 启动
full_command_line := DllCall("GetCommandLine", "str")
if not (A_IsAdmin or RegExMatch(full_command_line, " /restart(?!\S)"))
{
    try
    {
        if A_IsCompiled
            Run '*RunAs "' A_ScriptFullPath '" /restart'
        else
            Run '*RunAs "' A_AhkPath '" /restart "' A_ScriptFullPath '"'
    }
    ExitApp
}

Tray:= A_TrayMenu
Tray.Delete()
Tray.ClickCount := 2

WslMenu := Menu()
WslMenu.Add('Nginx', WslNginxMenuHandler)
WslMenu.Add('MySQL', WslMySQLMenuHandler)
WslMenu.Add('Gitea', WslGiteaMenuHandler)
Tray.Add("WSL", WslMenu)
Tray.Add()
Tray.Add('退出', ExitMenuHandler)

; 接管 Ctrl + Space，转到活动窗口
; ^Space::ControlSend, , ^{Space}, A
^Space::ControlSend('^{Space}', , 'A')
; x
return

WslNginxMenuHandler(A_ThisMenuItem, A_ThisMenuItemPos, MyMenu) {
    Run 'wsl -d Debian -u root service nginx start', , 'Hide'
}

WslMySQLMenuHandler(A_ThisMenuItem, A_ThisMenuItemPos, MyMenu) {
    Run 'wsl -d Debian -u root service mysql start', , 'Hide'
}

WslGiteaMenuHandler(A_ThisMenuItem, A_ThisMenuItemPos, MyMenu) {
    Run 'wsl -d Debian -u root nohup /data/gitea/gitea-1.20.4-linux-amd64 web & > /data/gitea/nohup.log', , 'Hide'
}

ExitMenuHandler(A_ThisMenuItem, A_ThisMenuItemPos, MyMenu) {
    ExitApp()
    return
}
