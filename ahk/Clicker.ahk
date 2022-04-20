; Clicker
CoordMode, Pixel
CoordMode, Mouse

SetBatchLines -1  ; 确保此方法最高的效率.
SleepDuration := 1  ; 这里有时可以根据下面的值进行细微调整(例如 2 与 3 的区别).
TimePeriod := 7 ; 尝试 7 或 3. 请参阅下面的注释.
; 在休眠持续时间一般向上取整到 15.6 ms 的个人电脑中, 尝试 TimePeriod:=7 来允许稍短一点的休眠, 而尝试 TimePeriod:=3 或更小的值来允许最小可能的休眠.

SetDefaultMouseSpeed, 0
SetMouseDelay, -1

loop := 0

loop
{
    if loop = 1
    {
        DllCall("Sleep", "UInt", SleepDuration)
        SendInput, {Click}
    }
}

z::
    if loop = 0
    {
        DllCall("Winmm\timeBeginPeriod", "UInt", TimePeriod)
        loop := 1
    }
    else
    {
        DllCall("Winmm\timeEndPeriod", "UInt", TimePeriod)
        loop := 0
    }
return
