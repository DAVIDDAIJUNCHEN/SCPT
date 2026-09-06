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
    export DEEPSEEK_BEARER_TOKEN="793fc19f5b26f0f35e3ace4cd1cc4a59d46d6587ff1a0fbb0fb30ee566ca8e8a"
    
    python ./deepseek_v4_bench.py
fi

if [ $step = "4" ]; then
    echo "step 4: call deepseek api from local mode (NEW API platform mode)"
    
    export DEEPSEEK_ENDPOINT="https://10.255.12.103/v1"
    export DEEPSEEK_MODEL="DeepSeek-V4-Flash-0731"
    export DEEPSEEK_MODE="local"
    export DEEPSEEK_BEARER_TOKEN="sk-a2OtMSxsgvn5BEfcoqBtHkIOas9L7v1TSOZomatjj6Ag2ewu"

    python ./deepseek_v4_bench.py
fi

