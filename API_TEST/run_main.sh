#!/user/env/bash 

step=$1

if [ $step == "1" ]; then 
    echo "step 1: call deepseek api from official mode"

    export DEEPSEEK_ENDPOINT="https://api.deepseek.com"
    export DEEPSEEK_MODEL="deepseek-chat"
    export DEEPSEEK_API_KEY="YOUR_API_KEY"
    export DEEPSEEK_MODE="official"

    python ./deepseek_v4_bench.py
fi

if [ $step = "2" ]; then
    echo "step 2: call deepseek api from local mode (NIM mode)" 

    export DEEPSEEK_ENDPOINT="http://10.32.1.3:30466/v1"
    export DEEPSEEK_MODEL="deepseek-ai/DeepSeek-V4-Flash"
    export DEEPSEEK_MODE="local"
    
    python ./deepseek_v4_bench.py
fi

if [ $step = "3" ]; then
    echo "step 3: call deepseek api from local mode (AI platform mode)"
    
    export DEEPSEEK_ENDPOINT="http://10.255.12.38:13206/v1"
    export DEEPSEEK_MODEL="deepseek-ai/DeepSeek-V4-Flash"
    export DEEPSEEK_MODE="local"
    export DEEPSEEK_BEARER_TOKEN="3f3e8075db921aa95d062e4116e6b65e2ca4e5364fae7e718f2579419d208b95"
    
    python ./deepseek_v4_bench.py
fi

