#SingleInstance force
DetectHiddenWindows True
Persistent ; 让脚本持续运行, 直到用户退出.

CustomIcon := 'Clash.ico'
if FileExist(CustomIcon) {
    TraySetIcon(CustomIcon)
}
A_IconTip := 'ClashX'

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
Tray.Add('启动/重启', StartMenuHandler)
Tray.Add('显示/隐藏', ShowMenuHandler)
Tray.Add('停止', StopMenuHandler)
Tray.Add()
Tray.Add('管理页面', ConfigMenuHandler)
Tray.Add()
Tray.Add('退出', ExitMenuHandler)

SetTimer AutoStart, -30000

return

AutoStart() {
    StartMenuHandler("", "", "")
    return
}

StartMenuHandler(A_ThisMenuItem, A_ThisMenuItemPos, MyMenu) {
    if WinExist('ahk_exe clash.exe') {
        WinKill 'ahk_exe clash.exe'
    }
    Run './clash.exe -d ./config/', , 'Hide'
    TrayTip(, '启动成功')
    return
}

ShowMenuHandler(A_ThisMenuItem, A_ThisMenuItemPos, MyMenu) {
    if DllCall('IsWindowVisible', 'UInt', WinExist('ahk_exe clash.exe')) {
        WinHide 'ahk_exe clash.exe'
    } else {
        WinShow 'ahk_exe clash.exe'
    }
    return
}

StopMenuHandler(A_ThisMenuItem, A_ThisMenuItemPos, MyMenu) {
    if WinExist('ahk_exe clash.exe') {
        WinKill 'ahk_exe clash.exe'
        TrayTip(, '已停止运行')
    }
    return
}

ConfigMenuHandler(A_ThisMenuItem, A_ThisMenuItemPos, MyMenu) {
    Run 'https://yacd.metacubex.one/'
    return
}

ExitMenuHandler(A_ThisMenuItem, A_ThisMenuItemPos, MyMenu) {
    if WinExist('ahk_exe clash.exe') {
        WinKill 'ahk_exe clash.exe'
        TrayTip(, '已停止运行')
    }
    ExitApp()
    return
}
