@echo off
setlocal enabledelayedexpansion

wsl --shutdown
wsl -d Debian -u root service nginx start | findstr "Starting nginx" > nul
wsl -d Debian -u root service mysql start | findstr "Starting MariaDB" > nul
wsl -d Ubuntu -u root service docker start | findstr "Starting Docker" > nul
if !errorlevel! equ 0 (
    echo service start success
    :: 添加 ip
    wsl -d Ubuntu -u root ip addr | findstr "192.168.240.200" > nul
    if !errorlevel! equ 0 (
        echo wsl ip has set
    ) else (
        ::不在的话给安排上
        wsl -d Ubuntu -u root ip addr add 192.168.240.200/24 broadcast 192.168.240.0 dev eth0 label eth0:1
        echo set wsl ip success: 192.168.240.200
    )

    ::windows作为wsl的宿主，在wsl的固定IP的同一网段也给安排另外一个IP
    ipconfig | findstr "192.168.240.100" > nul
    if !errorlevel! equ 0 (
        echo windows ip has set
    ) else (
        netsh interface ip add address "vEthernet (WSL)" 192.168.240.100 255.255.255.0
        echo set windows ip success: 192.168.240.100
    )
)
pause