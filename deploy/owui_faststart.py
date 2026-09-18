"""
OWUI 启动加速补丁 v2
====================

问题
----
OWUI 启动期 Python 冷导入耗时约 16s（占整体启动 25s 的 2/3），根因是两条
由第三方库「无条件 eager import」引发的重依赖加载链：

【链 1】sentence_transformers / torch（约 6.7s + 1.6s）
    open_webui.retrieval.utils
    └── langchain_classic.retrievers
        └── langchain_text_splitters          ← 包 __init__ 无条件全量导入
            └── langchain_text_splitters.sentence_transformers
                └── sentence_transformers     → 连带 torch

【链 2】spaCy / thinc / torch（约 7.7s）
    langchain_text_splitters/__init__.py 顶层无条件执行 14 个子模块导入：
        base, character, html, json, jsx, konlpy, latex, markdown,
        nltk, python, sentence_transformers, spacy, ...
    其中 spacy → thinc → torch 同样把重型栈拖入内存。

而 Python 包语义规定：**导入包内任意子模块，必先完整执行包的 __init__.py**。
所以哪怕只想要 `RecursiveCharacterTextSplitter`，也会被强制付全量代价。

本平台实际需要
--------------
OWUI 全仓库对 langchain_text_splitters 只有 1 处引用
（routers/retrieval.py:33）：

    from langchain_text_splitters import (
        MarkdownHeaderTextSplitter,      # ← .markdown
        RecursiveCharacterTextSplitter,  # ← .character
        TokenTextSplitter,               # ← .base
    )

其余 11 个子模块（spacy / nltk / konlpy / sentence_transformers / jsx / …）
OWUI **零使用**。

机制
----
1. 【跳过臃肿 __init__】向 sys.modules 预置一个轻量包对象（__path__ 指向真实
   目录），再用 SourceFileLoader 直接从磁盘加载 base / character / markdown
   三个 .py 文件。这样绕过包的 __init__.py，重型子模块一个都不执行。

2. 【sentence_transformers 降级】预置惰性代理。上游 LangChain 自带容错：
       try:
           from sentence_transformers import SentenceTransformer
           _HAS_SENTENCE_TRANSFORMERS = True
       except ImportError:
           _HAS_SENTENCE_TRANSFORMERS = False
   代理抛 ImportError 精确命中该降级分支，行为等价于「未安装该库」。

安全性
------
- OWUI 对 `SentenceTransformersTokenTextSplitter` / `_HAS_SENTENCE_TRANSFORMERS`
  全仓库零引用（grep 实测）。
- OWUI 对 sentence_transformers 的调用点全部是函数内局部 import
  （routers/retrieval.py:154,209 / routers/evaluations.py:73 /
    retrieval/utils.py:1772）；如需启用本地 embedding，把 _ALLOW_EAGER 置 True
  即可恢复真实加载。
- `transformers` **不处理**：langchain_text_splitters/base.py:33 顶层即
  `from transformers.tokenization_utils_base import PreTrainedTokenizerBase`，
  需要真实类对象参与类型注解，且其本身仅 1.1s、不连带 torch。

实测效果（本容器）
------------------
    langchain_text_splitters 导入          7.72s → 1.21s
    sentence_transformers 子模块数          153  → 1
    torch / spacy 进内存                   是   → 否
"""

import importlib.machinery
import importlib.util
import sys
import threading
import types

_TEXT_SPLITTERS = "langchain_text_splitters"
_SENTENCE_TRANSFORMERS = "sentence_transformers"

# OWUI 唯一依赖的三个子模块
_NEEDED_SUBMODULES = ("base", "character", "markdown")

# 置 True 可恢复 sentence_transformers 的真实加载（本地 embedding 场景）
_ALLOW_EAGER = False

_lock = threading.RLock()
_st_real = None
_st_failed = False
_st_loading = False


# --------------------------------------------------------------------------
# 1) langchain_text_splitters：跳过 __init__，只加载 3 个核心子模块
# --------------------------------------------------------------------------

def _install_light_text_splitters():
    """用轻量包对象 + 按文件加载子模块，绕过重型的包 __init__。"""
    existing = sys.modules.get(_TEXT_SPLITTERS)
    if existing is not None and getattr(existing, "_owui_light", False):
        return False                                   # 已安装
    if existing is not None:
        return False                                   # 真实包已加载，不干预

    # 定位真实包目录
    try:
        spec = importlib.machinery.PathFinder.find_spec(_TEXT_SPLITTERS)
    except Exception:
        spec = None
    if spec is None or not spec.submodule_search_locations:
        return False
    pkg_dir = list(spec.submodule_search_locations)[0]

    # 轻量包对象：占据 sys.modules，阻断真实 __init__ 执行
    light = types.ModuleType(_TEXT_SPLITTERS)
    light.__path__ = [pkg_dir]
    light.__file__ = pkg_dir + "/__init__.py"
    light.__spec__ = None
    light._owui_light = True
    sys.modules[_TEXT_SPLITTERS] = light

    loaded = {}
    for sub in _NEEDED_SUBMODULES:
        full = "%s.%s" % (_TEXT_SPLITTERS, sub)
        path = "%s/%s.py" % (pkg_dir, sub)
        try:
            loader = importlib.machinery.SourceFileLoader(full, path)
            sub_spec = importlib.util.spec_from_loader(full, loader)
            module = importlib.util.module_from_spec(sub_spec)
            sys.modules[full] = module
            loader.exec_module(module)
            setattr(light, sub, module)
            loaded[sub] = module
        except Exception:
            # 任一子模块失败：整体回滚，退回真实包（保证可用性优先）
            for key in list(sys.modules):
                if key == _TEXT_SPLITTERS or key.startswith(_TEXT_SPLITTERS + "."):
                    del sys.modules[key]
            return False

    # 把 OWUI 需要的三个类提到包顶层（等价于原 __init__ 的效果）
    exports = {
        "MarkdownHeaderTextSplitter": ("markdown", "MarkdownHeaderTextSplitter"),
        "RecursiveCharacterTextSplitter": ("character", "RecursiveCharacterTextSplitter"),
        "TokenTextSplitter": ("base", "TokenTextSplitter"),
        "TextSplitter": ("base", "TextSplitter"),
        "Tokenizer": ("base", "Tokenizer"),
        "Language": ("base", "Language"),
        "split_text_on_tokens": ("base", "split_text_on_tokens"),
        "MarkdownTextSplitter": ("markdown", "MarkdownTextSplitter"),
        "CharacterTextSplitter": ("character", "CharacterTextSplitter"),
    }
    for name, (sub, attr) in exports.items():
        mod = loaded.get(sub)
        if mod is not None and hasattr(mod, attr):
            setattr(light, name, getattr(mod, attr))

    # __all__：只列出真正可用的名字，避免 from ... import * 报错
    light.__all__ = sorted(
        n for n in exports if hasattr(light, n)
    )
    return True


# --------------------------------------------------------------------------
# 2) sentence_transformers：惰性代理 + ImportError 降级
# --------------------------------------------------------------------------

def _load_real_st():
    global _st_real, _st_failed, _st_loading
    if not _ALLOW_EAGER:
        return None
    if _st_real is not None or _st_failed:
        return _st_real
    with _lock:
        if _st_real is not None or _st_failed:
            return _st_real
        if _st_loading:
            return None
        _st_loading = True
        saved = sys.modules.pop(_SENTENCE_TRANSFORMERS, None)
        try:
            real = importlib.import_module(_SENTENCE_TRANSFORMERS)
        except BaseException:
            _st_failed = True
            real = None
        finally:
            _st_loading = False
            if real is None and saved is not None:
                sys.modules[_SENTENCE_TRANSFORMERS] = saved
        _st_real = real
    return _st_real


class _LazySTProxy(types.ModuleType):
    """sentence_transformers 惰性代理。

    _load_real_st() 返回 None 时抛 ImportError，精确触发上游
    langchain_text_splitters 的 try/except ImportError 降级分支。
    """

    def __getattr__(self, item):
        if item.startswith("__") and item.endswith("__"):
            raise AttributeError(item)
        real = _load_real_st()
        if real is None:
            raise ImportError(
                "sentence_transformers is lazy-stripped for faster startup "
                "(requested attribute %r)" % item
            )
        return getattr(real, item)

    def __dir__(self):
        real = _load_real_st()
        return dir(real) if real is not None else []


def _install_st_proxy():
    existing = sys.modules.get(_SENTENCE_TRANSFORMERS)
    if isinstance(existing, _LazySTProxy):
        return False
    if existing is not None:
        return False                    # 真实模块已加载，不干预

    proxy = _LazySTProxy(_SENTENCE_TRANSFORMERS)
    proxy.__file__ = None
    proxy.__spec__ = None
    proxy.__package__ = _SENTENCE_TRANSFORMERS
    proxy._owui_lazy = True
    # 不设 __path__：避免被当作包而触发子模块查找
    sys.modules[_SENTENCE_TRANSFORMERS] = proxy
    return True


# --------------------------------------------------------------------------
# 入口
# --------------------------------------------------------------------------

def install():
    """安装全部加速补丁。幂等：重复调用安全。

    必须在 `import langchain_text_splitters` 之前调用
    （OWUI 中即 open_webui.main 导入链最前端）。
    """
    with _lock:
        a = _install_light_text_splitters()
        b = _install_st_proxy()
    return a or b


def status():
    """自检：返回补丁状态字典。"""
    light = sys.modules.get(_TEXT_SPLITTERS)
    return {
        "text_splitters_light": bool(getattr(light, "_owui_light", False)),
        "st_proxied": isinstance(
            sys.modules.get(_SENTENCE_TRANSFORMERS), _LazySTProxy
        ),
        "torch_loaded": "torch" in sys.modules,
        "spacy_loaded": "spacy" in sys.modules,
    }
