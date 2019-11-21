#Include, Libs.ahk

SwitchIMEToEN()

; 启动 WSL Debian 并启动服务
Run powershell
Sleep, 2000
Send bash{enter}
Sleep, 2000
Send su{enter}
Sleep, 1000
Send 123456{enter}
Sleep, 2000
Send cd ~{enter}
Sleep, 1000
Send ./start.sh{enter}

Exit