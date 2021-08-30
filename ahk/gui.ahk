; test gui
CoordMode, ToolTip
CoordMode, Pixel
CoordMode, Mouse

gui, font, s10, Sarasa Mono Slab SC
gui, add, button, x5 y5 h30 w98 gFuncNacos, Nacos
gui, add, button, x107 y5 h30 w98 gFuncSentinel, Sentinel
gui, add, button, x5 y40 h30 w98 gFuncEasyConnect, EasyConnect
gui, add, button, x107 y40 h30 w98 gFuncOMClient, 运维客户端
gui, add, button, x5 y75 h30 w200 gFuncFrp, FRP
gui, add, button, x5 y110 h30 w200 gFuncTest, Test
gui, add, button, x5 y145 h30 w200 gClose, &Exit
gui, add, progress, vMyProgress w200

gui, show, h210 w210

global logEnable := false

Return

#Include, Libs.ahk

; 启动 EasyConnect
FuncEasyConnect:
{
    GuiControl,, MyProgress, 0
    Run, "C:/Program Files (x86)/Sangfor/SSL/SangforCSClient/SangforCSClient.exe"
    WinWait, EasyConnect,,50
    if ErrorLevel
    {
        GuiControl,, MyProgress, 100
        MsgBox Timeout 5
        Return
    }
    else
    {
        GuiControl,, MyProgress, 20
        WinGet, oldId, ID , EasyConnect
        AddLog(%oldId%)
        GuiControl,, MyProgress, 40
        Loop
        {
            Sleep, 400
            GuiControl,, MyProgress, 60
            WinWait, EasyConnect,,50
            WinGet, newId, ID , EasyConnect
            b := oldId != newId
            AddLog(%oldId% - %newId% - %b%)
            GuiControl,, MyProgress, 80
            if (oldId != newId)
            {
                GuiControl,, MyProgress, 100
                Sleep, 500
                SwitchIMEToEN()
                Send, username{Tab}password{enter}
                Return
            }
        }
    }
    Return
}

; 启动 运维客户端
FuncOMClient:
{
  Sleep, 3000
  SwitchIMEToEN()
  Send, username{Tab}password{enter}
  Exit
}

; 启动 frp
FuncFrp:
{
    Run powershell
    Sleep, 1000
    SwitchIMEToEN()
    Send cd C:\Files\Tools\frp{enter}
    Sleep, 500
    Send .\frpc.exe -c .\frpc_x1e_
    Return
}

; 启动 Nacos
FuncNacos(){
    Run wt
    Sleep, 2000
    Send cd C:\Files\Green\nacos\bin{enter}
    Sleep, 300
    Send cmd /c startup.cmd -m standalone{enter}
}


; 启动 Sentinel
FuncSentinel(){
    Run wt
    Sleep, 2000
    Send cd C:\Files\Green\sentinel{enter}
    Sleep, 300
    Send java --`% -Dserver.port=8718 -Dcsp.sentinel.dashboard.server=127.0.0.1:8718 -Dproject.name=sentinel-dashboard -jar sentinel-dashboard-1.8.1.jar{enter}
}


; 测试
FuncTest:
{
    Return
}

Close:
{
    exitapp
}

guiclose:
exit:
{
   exitapp
}
return
