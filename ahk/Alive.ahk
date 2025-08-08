#Requires AutoHotkey v2.0

; 该脚本每隔大约10秒就会快速地将鼠标左右移动一次。这种微小的、周期性的鼠标活动足以重置操作系统的空闲计时器，从而达到保持屏幕常亮的效果

#SingleInstance force
Persistent

CoordMode("Pixel")
CoordMode("Mouse")


loopStatus := 0

Loop
{
    MouseMove 10, 0, , "R"
    Sleep(1000)
    MouseMove -10, 0, , "R"
    Sleep(9000)
}
