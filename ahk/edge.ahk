#NoEnv
#SingleInstance force

I_Icon = .\img\Edge.ico
IfExist, %I_Icon%
Menu, Tray, Icon, %I_Icon%

EmptyMem()

#IfWinActive ahk_class Chrome_WidgetWin_1
    ~RButton Up::
    ~RButton::
        MouseGetPos, xPos, yPos
        WinGet,Mom,MinMax
        If ((yPos>45)And(Mom<1))Or((yPos>28)And(Mom>0)) Or (yPos<0)
            Return
        If GetKeyState("1")
            Return
        IfEqual, A_ThisHotkey, ~RButton, Send {Click Middle}
        Else Send {Click middle}
        EmptyMem()
        Return
#IfWinActive

EmptyMem(PID="AHK Rocks"){
    pid:=(pid="AHK Rocks") ? DllCall("GetCurrentProcessId") : pid
    h:=DllCall("OpenProcess", "UInt", 0x001F0FFF, "Int", 0, "Int", pid)
    DllCall("SetProcessWorkingSetSize", "UInt", h, "Int", -1, "Int", -1)
    DllCall("CloseHandle", "Int", h)
}
