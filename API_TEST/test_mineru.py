import json
import urllib.request
import ssl

url = "https://10.255.12.103/v1/chat/completions"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer API_KEY",
}
payload = {  # 同上 payload
    "model": "MinerU2.5-Pro-2605-1.2B",
    "messages": [{"role": "user", "content": [
        {"type": "text", "text": "Parse this document page to structured Markdown."},
        {"type": "image_url", "image_url": {
            "url": "https://d.ifengimg.com/q100/img1.ugc.ifeng.com/newugc/20210519/8/wemedia/34e5cef51b10c0b962cf47117c4799d14be33cc1_size219_w999_h666.jpeg"
        }}
    ]}],
    "max_tokens": 2048,
}

req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
# 自签名证书：关闭校验
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

with urllib.request.urlopen(req, context=ctx, timeout=120) as r:
    data = json.loads(r.read().decode())
print(data["choices"][0]["message"]["content"])
