"""
容器级 sitecustomize：在 Python 解释器启动时自动加载 OWUI 启动加速补丁。

放置位置：/data/owui/patch/sitecustomize.py（通过 compose 挂载进容器，
         并由 PYTHONPATH=/data/owui/patch 使其被 Python 自动导入）

作用：在 open_webui.main 被导入之前安装 faststart 补丁，
     剥离 langchain_text_splitters 臃肿的 __init__ 与 sentence_transformers/torch。
"""

import os
import sys

_PATCH_DIR = os.path.dirname(os.path.abspath(__file__))
if _PATCH_DIR not in sys.path:
    sys.path.insert(0, _PATCH_DIR)

try:
    import owui_faststart

    owui_faststart.install()
except Exception:
    # 补丁失败绝不阻断启动：静默降级为原生行为
    pass
