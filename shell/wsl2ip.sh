#!/bin/bash
# 获取 wsl2 ip
ip_addr=$(ip addr | grep 'scope global eth0' | awk '{print substr($2,0,length($2)-3)}')
echo "current ip: $ip_addr"
# 替换 hosts 文件中对应的一行
# xxx.xxx.xxx.xxx wsl
sed -i "s/[[:digit:]]\+\.[[:digit:]]\+\.[[:digit:]]\+\.[[:digit:]]\+[[:blank:]]\+wsl/${ip_addr}  wsl/g" /mnt/c/Windows/System32/drivers/etc/hosts
echo hosts update finish
