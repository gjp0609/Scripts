; 根据窗口标题获取pid
GetWindowByTitle(mode,title){
    SetTitleMatchMode, RegEx
    WinGet, pid,%mode%,%title%,,,
    Return pid
}

; 切换至英文输入法
SwitchIMEToEN(){
    SwitchIME("en")
}

; 切换输入法
SwitchIME(language){
    dwLayout="0x04090409"
    If ("zh" = language){
        ; 不知道微软拼音代码是啥
        dwLayout="0x08040804"
    }
    HKL:=DllCall("LoadKeyboardLayout", Str, dwLayout, UInt, 1)
    ControlGetFocus,ctl,A
    SendMessage,0x50,0,HKL,%ctl%,A
}

; 获取鼠标所在位置（基于活动窗口相对位置）
GetCursor(){
    Sleep, 5000
    MouseGetPos, xpos, ypos 
    Msgbox, The cursor is at X: %xpos% Y: %ypos%. 
}