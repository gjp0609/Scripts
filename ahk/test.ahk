; test gui
gui, font, s9, Lucida Console
gui, add, button, x5 y5 h50 w90 gFunc1, Click1
gui, add, button, x5 y60 h50 w90 gFunc2, Click2
gui, add, button, x5 y115 h50 w90 gClose, &Exit
Menu, tray, add
Menu, tray, add, Item1, MenuHandler

gui, show, h180 w300
return

MenuHandler:
MsgBox You selected %A_ThisMenuItem% from menu %A_ThisMenu%.
return

Func1:
{
    ImageSearch, OutputVarX, OutputVarY, 0, 0, 1000, 1000, R:/123.png
    Msgbox, x:%OutputVarX%, y:%OutputVarY%
    MouseMove, %OutputVarX%, %OutputVarY%, 100
    return
}

Func2:
{
    Msgbox, This is Func2
    return
}

Close:
{
    exitapp
}

guiclose:
exit:
{
   exitapp
}
return