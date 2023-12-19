#Requires AutoHotkey v2.0
Persistent
CoordMode "Pixel"
CoordMode "Mouse"
CoordMode "ToolTip"

SetTimer WatchCursor, 100

WatchCursor()
{
    MouseGetPos &x, &y
    ToolTip
    (
        "Position:
        x: " x ", y: " y
    )
}

; 按行读取文件操作
z::
{
    Loop read, ".\test.txt"
    {
        A_Clipboard := A_LoopReadLine
        ; 点击
        MouseMove 800, 800
        SendInput "{Click}"
        Sleep 1000
        MouseMove 800, 800
        SendInput "{Click}"
        Sleep 1000
        MouseMove 800, 800
        SendInput "{Click}"
        Sleep 1000
        MouseMove 800, 800
        SendInput "{Click}"
        Sleep 1000
        MouseMove 800, 800
        SendInput "{Click}"
        Sleep 1000
    }
}

return
