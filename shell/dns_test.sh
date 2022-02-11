#!/usr/bin/env bash

command -v bc >/dev/null || {
    echo "bc was not found. Please install bc."
    exit 1
}
{ command -v drill >/dev/null && dig=drill; } || { command -v dig >/dev/null && dig=dig; } || {
    echo "dig was not found. Please install dnsutils."
    exit 1
}

providers="
114#114.114.114.114
114#114.114.115.115
360#123.125.81.6
360#123.125.81.6
Alibaba#223.5.5.5
Alibaba#223.6.6.6
Baidu#180.76.76.76
CNNIC#1.2.4.8
CNNIC#210.2.4.8
DNSPod#119.29.29.29
Google#8.8.8.8
Google#8.8.4.4
OneDNS#117.50.10.10
OneDNS#52.80.52.52
OpenDNS#208.67.222.222
OpenDNS#208.67.222.220
"
# Cloudflare#1.1.1.1
# Cloudflare#1.0.0.1
# Level 3#4.2.2.1
# Level 3#4.2.2.2

# Domains to test. Duplicated domains are ok
domains="
163.com
baidu.com
bilibili.com
douban.com
iqiyi.com
jd.com
sogou.com
qq.com
sina.com.cn
taobao.com
weibo.com
zhihu.com
"
gfwDomains="
amazon.com
amazonaws.com
facebook.com
google.com
github.com
medium.com
microsoft.com
netflix.com
pixiv.net
reddit.com
v2ex.com
youtube.com
"

lineWidth=245

colorPrint() {
    if [ "$1" -gt 300 ]; then
        printf "\033[31m%15s\033[0m" "$1 ms"
    elif [ "$1" -gt 50 ]; then
        printf "\033[33m%15s\033[0m" "$1 ms"
    elif [ "$1" -gt 10 ]; then
        printf "\033[32m%15s\033[0m" "$1 ms"
    else
        printf "\033[34m%15s\033[0m" "$1 ms"
    fi
}

printDash() {
    for ((i = 1; i <= "$1"; i++)); do
        printf -- "-"
    done
}

testDNS() {
    totalDomains=0
    printf "%15s" ""
    for d in $1; do
        totalDomains=$((totalDomains + 1))
        printf "%15s" "$d"
    done
    printf "%15s\n" "Average"

    printDash $lineWidth
    echo ""

    for p in $providers; do
        name=${p%%#*}
        ip=${p##*#}
        time=0

        printf "%15s" "$name"
        for d in $1; do
            tTime=$($dig +tries=1 +time=2 +stats @"$ip" "$d" | grep "Query time:" | cut -d : -f 2- | cut -d " " -f 2)
            if [ -z "$tTime" ]; then
                # let's have time out be 1s = 1000ms
                tTime=1000
            elif [ "x$tTime" = "x0" ]; then
                tTime=1
            fi
            colorPrint "$tTime"
            time=$((time + tTime))
        done
        avg=$(bc -lq <<<"scale=2; $time/$totalDomains")
        colorPrint "${avg%.*}"
        printf "%15s" "$name"
        printf "%18s\n" "$ip"
        printDash $lineWidth
        echo ""
    done
}

printDash $lineWidth
echo ""
testDNS "$domains"
echo ""
testDNS "$gfwDomains"

exit 0
