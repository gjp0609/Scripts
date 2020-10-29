#!/bin/bash
redisPath=/root/software/redis/redis-6

# 启动节点
$redisPath/bin/redis-server $redisPath/cluster/21000/redis.conf
$redisPath/bin/redis-server $redisPath/cluster/21001/redis.conf
$redisPath/bin/redis-server $redisPath/cluster/21002/redis.conf
$redisPath/bin/redis-server $redisPath/cluster/21003/redis.conf
$redisPath/bin/redis-server $redisPath/cluster/21004/redis.conf
$redisPath/bin/redis-server $redisPath/cluster/21005/redis.conf

# 启动集群
$redisPath/bin/redis-cli --cluster create 127.0.0.1:21000 127.0.0.1:21001 127.0.0.1:21002 127.0.0.1:21003 127.0.0.1:21004 127.0.0.1:21005 --cluster-replicas 1
