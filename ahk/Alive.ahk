; Clicker
CoordMode, Pixel
CoordMode, Mouse

loop := 0

loop
{
    if loop = 1
    {
        SendInput, {Click}
        Sleep, 600000
    }
}

z::
    if loop = 0
    {
        ToolTip, startTime
        loop := 1
    }
    else
    {
        ToolTip, endTime
        loop := 0
    }
return
