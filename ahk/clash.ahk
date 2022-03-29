#NoEnv
#SingleInstance force
#Persistent ; 让脚本持续运行, 直到用户退出.
DetectHiddenWindows, On
Menu, Tray, NoMainWindow
Menu, Tray, NoStandard

SubUrl := "------"
ClashPath := "C:/Files/Portable/Clash"

CustomIcon = .\img\Clash.ico
IfExist, %CustomIcon%
Menu, Tray, Icon, %CustomIcon%

Menu, Tray, Add, 启动, StartMenuHandler
Menu, Tray, Add, 显示, ShowMenuHandler
Menu, Tray, Add, 停止, StopMenuHandler
Menu, Tray, Add, 更新, UpdateMenuHandler
Menu, Tray, Add, 退出, ExitMenuHandler
return

StartMenuHandler:
    If WinExist("ahk_exe clash.exe")
        WinKill, ahk_exe clash.exe
    Run, %ClashPath%/clash.exe -d ./config/, %ClashPath%,
    WinWait, ahk_exe clash.exe
    WinHide, ahk_exe clash.exe
    TrayTip, , 启动成功, 1,
return

ShowMenuHandler:
    WinShow, ahk_exe clash.exe
    TrayTip, , 更新完成, 1,
return


StopMenuHandler:
    If WinExist("ahk_exe clash.exe")
    {
        WinKill, ahk_exe clash.exe
        TrayTip, , 已停止运行, 1,
    }
return

UpdateMenuHandler:
    UrlDownloadToFile, %SubUrl%, %ClashPath%/config/config.yaml
    TrayTip, , 更新完成, 1,
return

ExitMenuHandler:
    If WinExist("ahk_exe clash.exe")
    {
        WinKill, ahk_exe clash.exe
        TrayTip, , 已停止运行, 1,
    }
    exitapp
return
