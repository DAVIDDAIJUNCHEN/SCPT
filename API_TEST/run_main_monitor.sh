#!/usr/bin/env bash

set -u

step=${1:-}
if [ -n "$step" ]; then
    shift
fi

if [ "$step" = "1" ]; then
    echo "step 1: call deepseek api from official mode (no server monitoring)"

    export DEEPSEEK_ENDPOINT="https://api.deepseek.com"
    export DEEPSEEK_MODEL="deepseek-chat"
    export DEEPSEEK_API_KEY="YOUR_API_KEY"
    export DEEPSEEK_MODE="official"

    python ./deepseek_v4_bench.py "$@"
fi

if [ "$step" = "2" ]; then
    echo "step 2: call deepseek api from local mode (NIM mode) with resource monitoring" 

    export DEEPSEEK_ENDPOINT="http://10.32.1.3:30466/v1"
    export DEEPSEEK_MODEL="deepseek-ai/DeepSeek-V4-Flash"
    export DEEPSEEK_MODE="local"
    
    python ./deepseek_v4_bench_monitor.py --ssh-alias allomax-h20-dsV4 "$@"
fi

if [ "$step" = "3" ]; then
    echo "step 3: call deepseek api from local mode (AI platform mode) with resource monitoring"
    
    export DEEPSEEK_ENDPOINT="http://10.255.12.38:13206/member1/deepseek/v1"
    export DEEPSEEK_MODEL="deepseek-ai/DeepSeek-V4-Flash"
    export DEEPSEEK_MODE="local"
    export DEEPSEEK_BEARER_TOKEN="YOUR_BEARER_TOKEN"
    
    python ./deepseek_v4_bench_monitor.py --ssh-alias allomax-h20-dsV4 "$@"
fi

if [ "$step" = "4" ]; then
    echo "step 4: call deepseek api from local mode (New API platform mode) with resource monitoring"

    export DEEPSEEK_ENDPOINT="https://10.255.12.103/v1"
    export DEEPSEEK_MODEL="DeepSeek-V4-Flash-0731"
    export DEEPSEEK_MODE="local"
    export DEEPSEEK_VERIFY_SSL="false"
    : "${DEEPSEEK_BEARER_TOKEN:?请先设置 DEEPSEEK_BEARER_TOKEN 环境变量}"
    export DEEPSEEK_BEARER_TOKEN

    python ./deepseek_v4_bench_monitor.py \
        --ssh-alias allomax-h20-dsV4-0731 \
        --server-port 443 \
        "$@"
fi

if [ "$step" != "1" ] && [ "$step" != "2" ] && [ "$step" != "3" ] && [ "$step" != "4" ]; then
    echo "用法: $0 {1|2|3|4}" >&2
    exit 2
fi

