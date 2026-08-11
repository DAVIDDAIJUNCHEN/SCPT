#!/user/env/bash 

step=$1

if [ $step == "1" ]; then 
    echo "step 1: call deepseek api from official mode (no server monitoring)"

    export DEEPSEEK_ENDPOINT="https://api.deepseek.com"
    export DEEPSEEK_MODEL="deepseek-chat"
    export DEEPSEEK_API_KEY="API_KEY"
    export DEEPSEEK_MODE="official"

    python ./deepseek_v4_bench.py
fi

if [ $step = "2" ]; then
    echo "step 2: call deepseek api from local mode (NIM mode) with resource monitoring" 

    export DEEPSEEK_ENDPOINT="http://10.32.1.3:30466/v1"
    export DEEPSEEK_MODEL="deepseek-ai/DeepSeek-V4-Flash"
    export DEEPSEEK_MODE="local"
    
    python ./deepseek_v4_bench_monitor.py --ssh-alias allomax-h20-dsV4
fi

if [ $step = "3" ]; then
    echo "step 3: call deepseek api from local mode (AI platform mode) with resource monitoring"
    
    export DEEPSEEK_ENDPOINT="http://10.255.12.38:13206/member1/deepseek/v1"
    export DEEPSEEK_MODEL="deepseek-ai/DeepSeek-V4-Flash"
    export DEEPSEEK_MODE="local"
    export DEEPSEEK_BEARER_TOKEN="BEAR_TOKEN"
    
    python ./deepseek_v4_bench_monitor.py --ssh-alias allomax-h20-dsV4
fi
