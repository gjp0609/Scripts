#!/bin/bash
temp_ip=$(cat ~/shell/ip.txt)
echo old ip: "$temp_ip"
public_ip=$(curl -s https://checkip.amazonaws.com/)
echo new ip: "$public_ip"
if [[ "$public_ip" != "$temp_ip" ]]; then
    echo "$public_ip" > ~/shell/ip.txt

    curl -k -X PUT "https://api.cloudflare.com/client/v4/zones/-----/dns_records/-----" \
    -H "Authorization: Bearer -----" \
    -H "Content-Type: application/json" \
    --data '{"type":"A","name":"*","content":"'"$public_ip"'","ttl":120,"proxied":false}'

    curl -k -X PUT "https://api.cloudflare.com/client/v4/zones/-----/dns_records/-----" \
        -H "Authorization: Bearer -----" \
        -H "Content-Type: application/json" \
        --data '{"type":"A","name":"@","content":"'"$public_ip"'","ttl":120,"proxied":false}'

    echo changed
fi
