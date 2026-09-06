import base64, os
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

AUDIO_PATH = "/Users/Admin/Desktop/daijun_clone_0001.wav"  # 改成你的音频路径
url = "https://10.255.12.103/v1/chat/completions"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer API_KEY",
}

if not os.path.exists(AUDIO_PATH):
    raise FileNotFoundError(f"音频不存在: {AUDIO_PATH}")

with open(AUDIO_PATH, "rb") as f:
    audio_b64 = base64.b64encode(f.read()).decode()

payload = {
    "model": "Qwen3-ASR-1.7B",
    "max_tokens": 2048,
    "messages": [{
        "role": "user",
        "content": [
            {"type": "text", "text": "请转写这段音频。"},
            {"type": "input_audio", "input_audio": {"data": audio_b64, "format": "wav"}},
        ],
    }],
}

resp = requests.post(url, headers=headers, json=payload, verify=False, timeout=120)
print("HTTP", resp.status_code)
data = resp.json()
if resp.status_code == 200:
    print("转写结果:", data["choices"][0]["message"]["content"])
else:
    print("错误:", data.get("error"))
