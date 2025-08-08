#Requires AutoHotkey v2.0
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

CodeServiceMenu := Menu()
CodeServiceMenu.Add('自动申报', CodeAutoReportMenuHandler)
CodeServiceMenu.Add('云平台爬虫', CodeSpiderMenuHandler)
CodeServiceMenu.Add('山西华电爬虫', CodeSxSpiderMenuHandler)
CodeServiceMenu.Add('中电建', CodeZdjMenuHandler)
Tray.Add("Code", CodeServiceMenu)

LdServiceMenu := Menu()
LdServiceMenu.Add('启用', LdServiceStartMenuHandler)
LdServiceMenu.Add('禁用', LdServiceStopMenuHandler)
Tray.Add("LdCore", LdServiceMenu)

WslMenu := Menu()
WslMenu.Add('Nginx', WslNginxMenuHandler)
WslMenu.Add('Redis', WslRedisMenuHandler)
WslMenu.Add('MySQL', WslMySQLMenuHandler)
WslMenu.Add('Gitea', WslGiteaMenuHandler)
Tray.Add("WSL", WslMenu)

Tray.Add()
Tray.Add('退出', ExitMenuHandler)

; 接管 Ctrl + Space，转到活动窗口
; ^Space::ControlSend, , ^{Space}, A
^Space::ControlSend('^{Space}', , 'A')

;; 增加注释
;*Space::
;{
;    Send "/**"
;    Sleep(1000)
;    Send "{Enter}"
;    Sleep(1000)
;    Send("^!o")  ; Ctrl + Alt + o
;    Send("^!l")  ; Ctrl + Alt + L
;}

; x

SetTimer AutoStart, -10000


AutoStart() {
    WslNginxMenuHandler("", "", "")
    return
}

CodeAutoReportMenuHandler(A_ThisMenuItem, A_ThisMenuItemPos, MyMenu) {
    Run 'wsl -d Debian -u root /mnt/r/Files/Workspace/Mine/Scripts/shell/codeBackup/backup.sh "/mnt/r/Files/Workspace/Sprixin/auto-report-build" "/mnt/r/Files/Workspace/Sprixin/Bundle/auto-report"', , 'Hide'
}

CodeSpiderMenuHandler(A_ThisMenuItem, A_ThisMenuItemPos, MyMenu) {
    Run 'wsl -d Debian -u root /mnt/r/Files/Workspace/Mine/Scripts/shell/codeBackup/backup.sh "/mnt/r/Files/Workspace/Sprixin/trade_spider" "/mnt/r/Files/Workspace/Sprixin/Bundle/trade_spider"', , 'Hide'
}

CodeSxSpiderMenuHandler(A_ThisMenuItem, A_ThisMenuItemPos, MyMenu) {
    Run 'wsl -d Debian -u root /mnt/r/Files/Workspace/Mine/Scripts/shell/codeBackup/backup.sh "/mnt/r/Files/Workspace/Sprixin/trade_spider_sx" "/mnt/r/Files/Workspace/Sprixin/Bundle/trade_spider_sx"', , 'Hide'
}

CodeZdjMenuHandler(A_ThisMenuItem, A_ThisMenuItemPos, MyMenu) {
    Run 'wsl -d Debian -u root /mnt/r/Files/Workspace/Mine/Scripts/shell/codeBackup/backup.sh "/mnt/r/Files/Workspace/Sprixin/sprixin-greenenergy-vue" "/mnt/r/Files/Workspace/Sprixin/Bundle/sprixin-greenenergy-vue"', , 'Hide'
}

LdServiceStartMenuHandler(A_ThisMenuItem, A_ThisMenuItemPos, MyMenu) {
    Run 'net start ldcore', , 'Hide'
}

LdServiceStopMenuHandler(A_ThisMenuItem, A_ThisMenuItemPos, MyMenu) {
    Run 'net stop ldcore', , 'Hide'
}

WslNginxMenuHandler(A_ThisMenuItem, A_ThisMenuItemPos, MyMenu) {
    Run 'wsl -d Debian -u root service nginx start', , 'Hide'
}

WslRedisMenuHandler(A_ThisMenuItem, A_ThisMenuItemPos, MyMenu) {
    Run 'wsl -d Debian -u root service redis-server start', , 'Hide'
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

return
