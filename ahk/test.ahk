; test gui
gui, add, button, x5 y5 h50 w90 gFunc1, Func1
gui, add, button, x5 y60 h50 w90 gFunc2, Func2
gui, show, h300 w100
return

Func1:
{
    Msgbox, This is Func1
}

Func2:
{
    Msgbox, This is Func2
}

guiclose:
exit:
{
   exitapp
}
return