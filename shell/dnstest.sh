#!/usr/bin/env bash

command -v bc > /dev/null || { echo "bc was not found. Please install bc."; exit 1; }
{ command -v drill > /dev/null && dig=drill; } || { command -v dig > /dev/null && dig=dig; } || { echo "dig was not found. Please install dnsutils."; exit 1; }

PROVIDERS="
1.1.1.1#cloudflare
8.8.8.8#google
208.67.222.22#opendns
223.5.5.5#ali
119.29.29.29#tencent
180.76.76.76#baidu
114.114.114.114#114
"

# Domains to test. Duplicated domains are ok
DOMAINS2TEST="www.google.com github.com amazonaws.com medium.com www.baidu.com www.bilibili.com www.qq.com jd.com www.163.com"

echo $DOMAINS2TEST

totaldomains=0
printf "%-18s" ""
for d in $DOMAINS2TEST; do
    totaldomains=$((totaldomains + 1))
    printf "%-8s" "test$totaldomains"
done
printf "%-8s" "Average"

echo ""

for p in $PROVIDERS; do
    pip=${p%%#*}
    pname=${p##*#}
    ftime=0

    printf "%-18s" "$pname"
    for d in $DOMAINS2TEST; do
        ttime=`$dig +tries=1 +time=2 +stats @$pip $d |grep "Query time:" | cut -d : -f 2- | cut -d " " -f 2`
        if [ -z "$ttime" ]; then
                #let's have time out be 1s = 1000ms
                ttime=1000
        elif [ "x$ttime" = "x0" ]; then
                ttime=1
            fi

        printf "%-8s" "$ttime ms"
        ftime=$((ftime + ttime))
    done
    avg=`bc -lq <<< "scale=2; $ftime/$totaldomains"`

    echo "  $avg"
done

exit 0;