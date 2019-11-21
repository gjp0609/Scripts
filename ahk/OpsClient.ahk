#Include, Libs.ahk

; 运维客户端
Run, "C:/Program Files (x86)/运维客户端/clientbrowser.exe"
Sleep, 2000
Click, 250, 210
Sleep, 3000
SwitchIMEToEN()
Send, user{Tab}password{enter}
Exit