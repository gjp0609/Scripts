; Loop
CoordMode, ToolTip
CoordMode, Pixel
CoordMode, Mouse

#MaxThreadsPerHotkey 2

RepeatCount := 0

#Z::
    if (RepeatCount == 0) {
        RepeatCount := 1
        while RepeatCount == 1 {
                ; Code here
        }
    } else {
        RepeatCount := 0
    }
return