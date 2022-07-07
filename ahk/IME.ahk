; 安装键盘钩子
; #InstallKeybdHook

CustomIcon = img/keybd.ico
IfExist, %CustomIcon%
Menu, Tray, Icon, %CustomIcon%

; 接管 Ctrl + Space，转到活动窗口
^Space::ControlSend, , ^{Space}, A
