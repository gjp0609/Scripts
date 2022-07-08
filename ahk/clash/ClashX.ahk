#NoEnv
#SingleInstance force
#Persistent ; 让脚本持续运行, 直到用户退出.
DetectHiddenWindows, On
Menu, Tray, NoMainWindow
Menu, Tray, NoStandard

IniRead, SubUrl, clash.ini, config, url,
IniRead, ClashPath, clash.ini, config, path,

CustomIcon = Clash.ico
IfExist, %CustomIcon%
Menu, Tray, Icon, %CustomIcon%

Menu, Tray, Add, 启动, StartMenuHandler
Menu, Tray, Add, 显示, ShowMenuHandler
Menu, Tray, Add, 停止, StopMenuHandler
Menu, Tray, Add
Menu, Tray, Add, 开启全局模式, GlobalMenuHandler
Menu, Tray, Add, 关闭全局模式, UnGlobalMenuHandler
Menu, Tray, Add, 更新配置文件, UpdateMenuHandler
Menu, Tray, Add, 打开管理页面, ConfigMenuHandler
Menu, Tray, Add
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

GlobalMenuHandler:
    RunWait,
    ( Join LTrim
    PowerShell -C "
    reg add \"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings\" /v ProxyEnable /t REG_DWORD /d 1 /f;
    reg add \"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings\" /v ProxyServer /d \"127.0.0.1:7890\" /f;
    reg add \"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings\" /v ProxyOverride /t REG_SZ /d \"192.168.*;127.0.0.1;localhost;\" /f
    "
    )
return

UnGlobalMenuHandler:
    RunWait, PowerShell -C "reg add \"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings\" /v ProxyEnable /t REG_DWORD /d 0 /f"
return

ConfigMenuHandler:
    Run, https://clash.razord.top/
return

ExitMenuHandler:
    If WinExist("ahk_exe clash.exe")
    {
        WinKill, ahk_exe clash.exe
        TrayTip, , 已停止运行, 1,
    }
    exitapp
return
