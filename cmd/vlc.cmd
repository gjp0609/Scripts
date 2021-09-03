@REM 打开 vlc 并截取 scheme 头
set "arg=%1"
set "argp=%arg:*:=%"
cd "C:\Program Files\VideoLAN\VLC\"
start vlc --http-reconnect %argp%