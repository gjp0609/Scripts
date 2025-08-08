#Requires AutoHotkey v2.0

; ============================================================================
; 连点器 - 最大速度方案
;
; 原理:
; 使用“忙等待”无限循环，并结合 timeBeginPeriod 提升 Sleep 精度，
; 以消耗一个 CPU 核心为代价，换取理论上最快的点击速度。
; 经过测试，此方案远快于 SetTimer 方案。
; ============================================================================

CoordMode("Pixel")
CoordMode("Mouse")

; TimePeriod: 系统计时器精度 (ms)。此为实现超高CPS的核心设置。
; - Windows默认计时精度为 ~15.6ms。这意味着 Sleep(1) 实际会暂停约15.6ms，从而将点击速度上限锁死在 ~64 CPS (1000/15.6)。
; - 本设置通过 timeBeginPeriod API 将系统精度临时提升至设定值 (如3ms)，使得 Sleep() 行为更精确，从而突破速度限制。
; - 值越小，速度越快，但会增加CPU功耗。推荐 3 或 7 作为速度与负载的平衡点。脚本停止时会自动恢复默认值，确保安全。
TimePeriod := 3
SleepDuration := 1       ; 每次点击后的暂停时间(毫秒)，值越小CPS越高(0或1为最快)，其高精度休眠依赖于TimePeriod的设定。
A_DefaultMouseSpeed := 0 ; 鼠标移动速度(0为瞬时, 100最慢)，设为0以消除任何潜在的移动延迟。
A_MouseDelay := -1       ; 每次鼠标事件后的自动延迟(毫秒)，设为-1以实现最高点击性能。

; --- 以 Admin 启动 ---
if !A_IsAdmin {
    try {
        Run '*RunAs "' A_AhkPath '" /restart "' A_ScriptFullPath '"'
        ExitApp()
    } catch {
        MsgBox "请求管理员权限失败，脚本将以普通模式运行。", "提醒", 48
    }
}

; --- 核心逻辑 ---

; 定义全局变量作为循环开关
global loop_active := 0

; 启动一个无限循环，持续检查开关状态。
; 这是实现最高速度的关键，但会在后台持续占用 CPU。
Loop {
    if (loop_active == 1) {
        SendInput("{Click}")
        ; 这个 Sleep 会被 timeBeginPeriod 优化，实现高精度休眠
        if (SleepDuration > 0) {
            DllCall("Sleep", "UInt", SleepDuration)
        }
    } else {
        ; 在不点击时，为了避免 CPU 100% 空转，可以加入一个短暂的休眠。
        ; 这会显著降低 CPU 占用，但会增加启动点击时的延迟。
        ; 如果追求极致的响应速度，可以注释掉下面这行。
        Sleep(15)
    }
}

; --- 热键控制 ---
z:: {
    global loop_active, TimePeriod

    if (loop_active == 0) {
        loop_active := 1
        ; 仅在启动时调用 timeBeginPeriod
        DllCall("Winmm\timeBeginPeriod", "UInt", TimePeriod)
    } else {
        loop_active := 0
        ; 仅在停止时调用 timeEndPeriod
        DllCall("Winmm\timeEndPeriod", "UInt", TimePeriod)
    }
}
