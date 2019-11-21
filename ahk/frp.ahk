#Include, Libs.ahk

SwitchIMEToEN()

; 启动 frp
Run powershell
Sleep, 2000
Send cd C:\Users\gjp06\OneDrive\Programs\Green\frp{enter}
Sleep, 1000
Send .\frpc.exe -c .\frpc_x1e.ini{enter}

Exit