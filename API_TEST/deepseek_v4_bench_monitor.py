#!/usr/bin/env python3
"""
DeepSeek V4 Benchmark 资源监控集成脚本
========================================
支持两种模式：
  - 本地模式（默认）：通过 psutil 监控本机进程资源
  - 远程模式（--ssh-host）：通过持久 SSH 流式采集系统级 CPU / 内存 / GPU

远程模式原理：
  建立一条持久 SSH 会话，在远程服务器上运行 while 循环脚本（间隔 0.1s），
  每轮采集系统 CPU（top）、系统内存（/proc/meminfo）、GPU（nvidia-smi），
  输出 JSON 行，由本地线程逐行解析并记录。告别进程级 PID 查找，直接用系统级指标。

用法：
  # 本地模式（服务在本机）
  python deepseek_v4_bench_monitor.py --server-port 13206

  # 远程模式（服务在远程服务器，系统级监控）
  python deepseek_v4_bench_monitor.py --ssh-host 10.255.12.38 --ssh-port 22 --ssh-user root --server-port 13206

  # 使用 SSH 密钥
  python deepseek_v4_bench_monitor.py --ssh-host 10.255.12.38 --ssh-user root --ssh-key ~/.ssh/id_rsa --server-port 13206

  # 使用 ~/.ssh/config 别名（推荐） + 自定义采样间隔
  python deepseek_v4_bench_monitor.py --ssh-alias allomax-h20-dsV4 --server-port 30466 --sample-interval 0.1

  # 仅做环境验证
  python deepseek_v4_bench_monitor.py --ssh-alias allomax-h20-dsV4 --verify-only

依赖：
  pip install psutil httpx（不再需要 paramiko）
"""

import os
import sys
import time
import csv
import json
import shlex
import asyncio
import argparse
import threading
import statistics
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional

import psutil

# ========================= 常量 =========================

SAMPLE_INTERVAL = 0.5          # 采样间隔（秒），受 top -bn2 测量耗时约束，实际下限约 0.4s
OUTPUT_DIR = Path(__file__).parent / "results"


# ========================= 数据结构 =========================

@dataclass
class ResourceSample:
    """单次资源采样快照"""
    timestamp: float
    cpu_percent: float = 0.0         # 系统级 CPU 使用率
    memory_rss_mb: float = 0.0       # 系统已用内存
    memory_vms_mb: float = 0.0       # 系统总内存
    io_read_mb: float = 0.0
    io_write_mb: float = 0.0
    gpu_mem_mb: Optional[float] = None
    gpu_util: Optional[float] = None
    system_cpu_percent: float = 0.0  # 同 cpu_percent，保留兼容


@dataclass
class TestSegment:
    """一个测试项目对应的资源数据段"""
    name: str
    start_idx: int
    end_idx: int
    samples: list = field(default_factory=list)

    @property
    def cpu_mean(self): return statistics.mean([s.cpu_percent for s in self.samples]) if self.samples else 0
    @property
    def cpu_max(self): return max([s.cpu_percent for s in self.samples]) if self.samples else 0
    @property
    def mem_mean(self): return statistics.mean([s.memory_rss_mb for s in self.samples]) if self.samples else 0
    @property
    def mem_max(self): return max([s.memory_rss_mb for s in self.samples]) if self.samples else 0
    @property
    def gpu_mean(self):
        vals = [s.gpu_mem_mb for s in self.samples if s.gpu_mem_mb is not None]
        return statistics.mean(vals) if vals else None
    @property
    def gpu_max(self):
        vals = [s.gpu_mem_mb for s in self.samples if s.gpu_mem_mb is not None]
        return max(vals) if vals else None
    @property
    def gpu_util_mean(self):
        vals = [s.gpu_util for s in self.samples if s.gpu_util is not None]
        return statistics.mean(vals) if vals else None
    @property
    def gpu_util_max(self):
        vals = [s.gpu_util for s in self.samples if s.gpu_util is not None]
        return max(vals) if vals else None
    @property
    def duration(self):
        if len(self.samples) < 2:
            return 0
        return self.samples[-1].timestamp - self.samples[0].timestamp


# ========================= 远程 SSH 监控器 =========================

class SSHRemoteMonitor:
    """通过 SSH 在远程服务器上持续采集系统资源。（持久 SSH 流 + 系统级 CPU/内存/GPU）"""

    # —— 一次性查找进程 PID ——
    _FIND_PID_SCRIPT = r'''
PORT={port}
PID=$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K\d+' | head -1)
if [ -z "$PID" ]; then
    PID=$(netstat -tlnp 2>/dev/null | grep ":$PORT " | awk '{{print $NF}}' | grep -oP '\d+' | head -1)
fi
if [ -z "$PID" ]; then
    PID=$(lsof -i :$PORT -sTCP:LISTEN -t 2>/dev/null | head -1)
fi
echo "PID=$PID"
'''

    # —— 持久采样脚本（远程 while 循环，逐行输出 JSON，间隔 {interval} 秒）——
    _MONITOR_SCRIPT = r'''
echo '[MARVIS_READY]'
while true; do
    LOOP_START=$(date +%s.%N)
    TS=$LOOP_START
    # GPU utilization from continuous dmon background process (no blind spots)
    GPU_UTIL=$(tail -1 {dmon_log} 2>/dev/null | awk '!/^#/{{print $2}}')
    # 兜底：若 dmon 日志无数据（进程未启动或已死），降级到 nvidia-smi 直接查询
    if [ -z "$GPU_UTIL" ]; then
        GPU_UTIL=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ')
    fi
    # GPU memory (fast snapshot, slow-changing metric)
    GPU_MEM=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ')
    # System CPU: two-sample top (0.3s apart), take second round to skip boot-average
    SYS_CPU=$(top -bn2 -d 0.3 2>/dev/null | grep 'Cpu' | tail -1 | awk '{{for(i=2;i<=NF;i++)if($i~/[0-9.]+/){{sum+=$i}}}} END{{print sum}}')
    # System memory
    MEM_TOTAL=$(awk '/MemTotal/{{printf "%.0f", $2/1024}}' /proc/meminfo 2>/dev/null)
    MEM_AVAIL=$(awk '/MemAvailable/{{printf "%.0f", $2/1024}}' /proc/meminfo 2>/dev/null)
    printf '{{"ts":"%s","sys_cpu":"%s","mem_total_mb":"%s","mem_avail_mb":"%s","gpu_mem":"%s","gpu_util":"%s"}}\n' "$TS" "$SYS_CPU" "$MEM_TOTAL" "$MEM_AVAIL" "$GPU_MEM" "$GPU_UTIL"
    # 动态补偿 sleep：用 bc 计算本轮回合耗时，从目标间隔中扣除后仅 sleep 剩余时长
    NOW=$(date +%s.%N)
    SLEEP_TIME=$(echo "{interval} - ($NOW - $LOOP_START)" | bc 2>/dev/null || echo 0)
    if [ -n "$SLEEP_TIME" ] && [ "$(echo "$SLEEP_TIME > 0.01" | bc 2>/dev/null)" = "1" ]; then
        sleep $SLEEP_TIME
    fi
done
'''

    # —— 一次性验证用采样脚本（跟 _MONITOR_SCRIPT 共用 dmon 日志）——
    _VERIFY_SCRIPT = r'''
TS=$(date +%s.%N)
GPU_UTIL=$(tail -1 {dmon_log} 2>/dev/null | awk '!/^#/{{print $2}}')
if [ -z "$GPU_UTIL" ]; then
    GPU_UTIL=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ')
fi
GPU_MEM=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ')
SYS_CPU=$(top -bn2 -d 0.3 2>/dev/null | grep 'Cpu' | tail -1 | awk '{{for(i=2;i<=NF;i++)if($i~/[0-9.]+/){{sum+=$i}}}} END{{print sum}}')
MEM_TOTAL=$(awk '/MemTotal/{{printf "%.0f", $2/1024}}' /proc/meminfo 2>/dev/null)
MEM_AVAIL=$(awk '/MemAvailable/{{printf "%.0f", $2/1024}}' /proc/meminfo 2>/dev/null)
printf '{{"ts":"%s","sys_cpu":"%s","mem_total_mb":"%s","mem_avail_mb":"%s","gpu_mem":"%s","gpu_util":"%s"}}\n' "$TS" "$SYS_CPU" "$MEM_TOTAL" "$MEM_AVAIL" "$GPU_MEM" "$GPU_UTIL"
'''

    def __init__(self, host: str, port: int = 22, user: str = "root",
                 password: Optional[str] = None, key_path: Optional[str] = None,
                 ssh_alias: Optional[str] = None, sample_interval: float = SAMPLE_INTERVAL):
        import random
        self.host = host
        self.ssh_port = port
        self.user = user
        self.password = password
        self.key_path = key_path or os.path.expanduser("~/.ssh/id_rsa")
        self.ssh_alias = ssh_alias
        self.sample_interval = sample_interval
        self.target_pid: Optional[int] = None
        self.samples: list[ResourceSample] = []
        self.segments: list[TestSegment] = []
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._start_time: float = 0.0
        self._ssh_target = ""
        # 持续 dmon 后台进程
        self._dmon_tag = f"marvis_{datetime.now().strftime('%H%M%S')}_{os.getpid()}_{random.randint(1000,9999)}"
        self._dmon_log = f"/tmp/marvis_dmon_{self._dmon_tag}.log"
        # 时钟同步偏移量（远程 - 本地，秒；正数表示远程更快）
        self._clock_offset: float = 0.0

    # —————— SSH 基础设施 ——————

    def _build_ssh_cmd(self) -> list[str]:
        """构建原生 ssh 命令，兼容 ~/.ssh/config 别名和独立参数。"""
        if self.ssh_alias:
            return ["ssh", "-T", self.ssh_alias]   # -T 禁用伪终端，确保 stdout 干净
        cmd = ["ssh", "-T",
               "-o", "StrictHostKeyChecking=accept-new",
               "-o", "ConnectTimeout=10",
               "-o", "ServerAliveInterval=15",    # 保持长连接存活
               "-p", str(self.ssh_port)]
        if self.key_path:
            cmd += ["-i", self.key_path]
        cmd.append(f"{self.user}@{self.host}")
        return cmd

    def _connect(self) -> bool:
        """测试 SSH 连通性。"""
        self._ssh_target = self.ssh_alias or f"{self.user}@{self.host}:{self.ssh_port}"
        cmd = self._build_ssh_cmd() + ["echo 'ssh_ok' && hostname"]
        try:
            import subprocess
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            if result.returncode == 0 and "ssh_ok" in result.stdout:
                hostname = result.stdout.strip().split("\n")[-1] if result.stdout.strip() else "?"
                print(f"[SSH] 已连接到 {self._ssh_target} → {hostname}")
                return True
            else:
                stderr = result.stderr.strip()
                print(f"[SSH] 连接失败: {stderr if stderr else '返回码 ' + str(result.returncode)}")
                return False
        except FileNotFoundError:
            print("[SSH] 错误：未找到 ssh 命令")
            return False
        except Exception as e:
            print(f"[SSH] 连接失败: {e}")
            return False

    def _exec(self, script: str, timeout: int = 15) -> str:
        """通过原生 ssh 执行一次性远程命令并返回 stdout。"""
        try:
            import subprocess
            cmd = self._build_ssh_cmd() + [script]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
            return result.stdout
        except subprocess.TimeoutExpired:
            return ""
        except Exception:
            return ""

    def _exec_bg(self, script: str) -> None:
        """通过 SSH 启动远程后台进程（fire-and-forget，不等待返回）。"""
        try:
            import subprocess
            cmd = self._build_ssh_cmd() + [script]
            subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception as e:
            print(f"[SSH] 后台命令启动失败: {e}")

    # —————— 环境验证 ——————

    def _parse_one_sample(self, line: str) -> Optional[dict]:
        """尝试解析一行 JSON 数据。优先 json.loads 整行，失败则用非贪婪正则提取。"""
        # 快速路径：整行即 JSON
        try:
            obj = json.loads(line)
            if isinstance(obj, dict) and "ts" in obj:
                return obj
        except json.JSONDecodeError:
            pass
        # 降级路径：从杂糅文本中提取第一个 JSON 对象（非贪婪，不跨越对象边界）
        import re
        m = re.search(r'\{[^{}]*\}', line)
        if not m:
            return None
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            return None

    def verify(self) -> bool:
        """验证 SSH 远程环境：工具可用性 + 一次试采样。"""
        print("\n" + "=" * 60)
        print("[SSH 验证] 检查远程服务器环境...")
        print("=" * 60)

        all_ok = True

        # 1. 连通性
        result = self._exec("echo 'ssh_ok' && hostname && uname -r")
        if "ssh_ok" in result:
            lines = [l.strip() for l in result.splitlines() if l.strip()]
            hostname = lines[1] if len(lines) > 1 else "?"
            kernel = lines[2] if len(lines) > 2 else "?"
            print(f"  [OK] SSH 连接正常 → {hostname} (kernel {kernel})")
        else:
            print(f"  [FAIL] SSH 连接异常，返回: {result[:120]}")
            all_ok = False

        # 2. 必需工具
        tools = {
            "top": "top -v 2>&1 | head -1",
            "nvidia-smi": "nvidia-smi --query-gpu=name --format=csv,noheader 2>&1 | head -1",
            "/proc 文件系统": "test -d /proc && echo 'OK' || echo 'MISSING'",
        }
        for name, cmd in tools.items():
            out = self._exec(cmd, timeout=10).strip()
            if out and "FAIL" not in out and "MISSING" not in out and "not found" not in out.lower():
                short = out[:100].replace("\n", " | ")
                print(f"  [OK] {name}: {short}")
            else:
                print(f"  [WARN] {name}: 不可用 ({out[:80] if out else '空'})")
                if name in ("nvidia-smi", "/proc 文件系统"):
                    all_ok = False

        # 3. 试采样
        print("\n  [试采样] 运行一次采样...")
        output = self._exec(self._VERIFY_SCRIPT.format(dmon_log=self._dmon_log), timeout=20)
        print(f"  --- 远程脚本原始输出 (前 800 字符) ---")
        print(output[:800] if output else "(空)")
        print(f"  --- 输出结束 ---")

        data = self._parse_one_sample(output)
        if data:
            cpu = data.get("sys_cpu", "?")
            mem_t = data.get("mem_total_mb", "?")
            mem_a = data.get("mem_avail_mb", "?")
            gpu = data.get("gpu_mem", "?")
            util = data.get("gpu_util", "?")
            print(f"  [OK] 解析成功 → 系统CPU={cpu}%, 内存可用={mem_a}M/{mem_t}M, GPU={gpu}M/{util}%")
        else:
            print(f"  [FAIL] 未能从输出中解析出有效 JSON")
            all_ok = False

        print("=" * 60)
        if all_ok:
            print("[SSH 验证] 全部通过，远程监控准备就绪。\n")
        else:
            print("[SSH 验证] 存在失败项，请检查远程服务器环境。\n")
        return all_ok

    # —————— 生命周期 ——————

    def start(self, server_port: Optional[int] = None):
        """启动远程监控（持久 SSH 会话 + 后台线程消费）。"""
        if not self._connect():
            return

        # 启动持续 dmon 后台进程（setsid 完全脱离 SSH 会话，避免 SSH 等待子进程退出而 hang）
        dmon_cmd = (f"setsid nvidia-smi dmon -s u -d 0.05 -c 0 "
                    f"> {self._dmon_log} 2>&1 < /dev/null & "
                    f"echo 'DMON_LAUNCHED'")
        dmon_out = self._exec(dmon_cmd, timeout=5)
        launched = "DMON_LAUNCHED" in dmon_out
        print(f"[SSH] dmon 启动: {'成功' if launched else '可能失败(' + dmon_out.strip()[:80] + ')'}")

        if launched:
            # 验证 dmon 进程存活 + 日志有数据
            dmon_check = self._exec(
                f"echo '--进程数--' && pgrep -fc 'nvidia-smi dmon.*marvis_dmon_{self._dmon_tag}' || echo 0 && "
                f"echo '--日志行数--' && wc -l < {self._dmon_log} 2>/dev/null || echo 0 && "
                f"echo '--日志尾部--' && tail -3 {self._dmon_log} 2>/dev/null || echo '(空)'",
                timeout=5
            )
            print(f"[SSH] dmon 验证:\n{dmon_check.strip()[:500]}")
        else:
            print("[SSH] dmon 未成功启动，GPU 利用率将降级为 nvidia-smi 逐次查询")

        # 时钟同步：测量 RTT 并估算远程-本地偏移
        t0 = time.time()
        remote_out = self._exec("date +%s.%N", timeout=3).strip()
        t1 = time.time()
        rtt = t1 - t0
        try:
            remote_ts = float(remote_out.splitlines()[-1])
            self._clock_offset = remote_ts - (t0 + rtt / 2)
            print(f"[SSH] 时钟同步: RTT={rtt*1000:.1f}ms, offset={self._clock_offset*1000:+.1f}ms "
                  f"({'远程更快' if self._clock_offset > 0 else '本地更快'})")
        except (ValueError, IndexError):
            self._clock_offset = 0.0
            print(f"[SSH] 时钟同步失败，offset 默认为 0")

        # 查找远程服务 PID（仅作参考，不影响系统级监控）
        if server_port:
            result = self._exec(self._FIND_PID_SCRIPT.format(port=server_port))
            for line in result.splitlines():
                if line.startswith("PID="):
                    pid_str = line.split("=", 1)[1].strip()
                    if pid_str and pid_str.isdigit():
                        self.target_pid = int(pid_str)
            if self.target_pid:
                print(f"[SSH] 远程端口 {server_port} → PID={self.target_pid}")
            else:
                print(f"[SSH] 未找到端口 {server_port} 的进程，使用系统级监控")

        if not self.verify():
            print("[SSH] 环境验证未通过，但仍将继续尝试采样。\n")

        print(f"[SSH] 远程监控已启动（持久流 间隔 {self.sample_interval}s）")
        self._start_time = time.time()
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._sample_loop, daemon=True)
        self._thread.start()

    def stop(self):
        """停止监控，清理远程 dmon，关闭 SSH 会话。"""
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=8)
        # 清理 dmon 后台进程
        self._exec(f"pkill -f 'nvidia-smi dmon.*marvis_dmon_{self._dmon_tag}' 2>/dev/null; "
                   f"rm -f {self._dmon_log}", timeout=5)
        print("[SSH] 远程监控已停止")

    def mark_start(self, test_name: str):
        with self._lock:
            idx = len(self.samples)
            seg = TestSegment(name=test_name, start_idx=idx, end_idx=idx)
            self.segments.append(seg)
            print(f"\n[Monitor] >>> {test_name} 开始 @ {time.strftime('%H:%M:%S')}")

    def mark_end(self, test_name: str):
        with self._lock:
            idx = len(self.samples)
            for seg in reversed(self.segments):
                if seg.name == test_name and seg.end_idx == seg.start_idx:
                    seg.end_idx = idx
                    break
            print(f"[Monitor] <<< {test_name} 结束 @ {time.strftime('%H:%M:%S')}")

    # —————— 核心采样循环（持久 SSH 流） ——————

    def _sample_loop(self):
        """通过持久 SSH 会话运行远程监控脚本，逐行解析 JSON 并记录。"""
        import subprocess
        script = self._MONITOR_SCRIPT.format(interval=self.sample_interval, dmon_log=self._dmon_log)
        # 强制行缓冲：管道输出在 glibc 下默认全缓冲 (4KB)，stdbuf -oL 逐行 flush
        cmd = self._build_ssh_cmd() + [f"stdbuf -oL bash -c {shlex.quote(script)}"]

        try:
            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, bufsize=1  # 行缓冲
            )
        except Exception as e:
            print(f"[SSH] 无法启动远程监控进程: {e}")
            return

        self._sample_count = 0
        self._err_count = 0
        self._skip_count = 0
        self._first_remote_ts: Optional[float] = None  # 首个远程时间戳锚点

        print("[SSH] 等待远程流输出...")
        try:
            for line in iter(proc.stdout.readline, ""):
                if self._stop_event.is_set():
                    break

                line = line.strip()
                if not line:
                    continue

                # 每行独立解析（远程脚本每行输出完整 JSON，不做跨行拼接）
                data = self._parse_one_sample(line)
                if data is None:
                    self._skip_count += 1
                    if self._skip_count <= 3:
                        print(f"  [SSH] 跳过非 JSON 行: {line[:100]}")
                    continue

                # 使用远程时间戳，首个样本作为零点
                remote_ts = float(data.get("ts") or 0)
                if self._first_remote_ts is None:
                    self._first_remote_ts = remote_ts
                    print(f"  [SSH] 首个有效样本 @ remote_ts={remote_ts}")
                sample_time = remote_ts - self._first_remote_ts if self._first_remote_ts else 0.0
                sys_cpu = float(data.get("sys_cpu") or 0)
                mem_total = float(data.get("mem_total_mb") or 0)
                mem_avail = float(data.get("mem_avail_mb") or 0)
                mem_used = mem_total - mem_avail
                gpu_mem_raw = data.get("gpu_mem", "")
                gpu_util_raw = data.get("gpu_util", "")
                gpu_mem = float(gpu_mem_raw) if gpu_mem_raw and gpu_mem_raw not in (None, "null", "") else None
                gpu_util = float(gpu_util_raw) if gpu_util_raw and gpu_util_raw not in (None, "null", "") else None

                # 前 5 条输出实时数据
                self._sample_count += 1
                if self._sample_count <= 5:
                    if gpu_mem is not None and gpu_util is not None:
                        gpu_str = f"GPU={gpu_mem:.0f}M/{gpu_util:.0f}%"
                    elif gpu_mem is not None:
                        gpu_str = f"GPU={gpu_mem:.0f}M/util=N/A"
                    else:
                        gpu_str = "GPU=N/A"
                    print(f"  [采样 #{self._sample_count}] 系统CPU={sys_cpu:.1f}% | "
                          f"内存已用={mem_used:.0f}M/总={mem_total:.0f}M | {gpu_str}")

                sample = ResourceSample(
                    timestamp=sample_time,
                    cpu_percent=sys_cpu,
                    memory_rss_mb=mem_used,
                    memory_vms_mb=mem_total,
                    gpu_mem_mb=gpu_mem,
                    gpu_util=gpu_util,
                    system_cpu_percent=sys_cpu,
                )

                with self._lock:
                    self.samples.append(sample)

        except Exception as e:
            self._err_count += 1
            print(f"  [SSH] 流读取异常: {e}")
        finally:
            # dump 远程 stderr 用于诊断
            try:
                proc.wait(timeout=3)
                stderr_out = proc.stderr.read()
                if stderr_out:
                    stderr_preview = stderr_out.strip()[:500]
                    print(f"  [SSH] 远程 stderr ({len(stderr_out)} bytes):\n{stderr_preview}")
            except Exception:
                pass
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                proc.kill()

            print(f"  [SSH] 采样线程结束: 有效样本={self._sample_count}, "
                  f"跳过行={self._skip_count}, 异常={self._err_count}")

    def build_segments(self):
        for seg in self.segments:
            seg.samples = self.samples[seg.start_idx:seg.end_idx]


# ========================= 本地 psutil 监控器 =========================

class LocalMonitor:
    """通过 psutil 监控本机进程资源。"""

    def __init__(self, target_pid: Optional[int] = None):
        self.target_pid = target_pid
        self.samples: list[ResourceSample] = []
        self.segments: list[TestSegment] = []
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._start_time: float = 0.0
        self._proc: Optional[psutil.Process] = None
        self._pynvml = None
        self._gpu_handles = []
        self._init_gpu()

    def _init_gpu(self):
        try:
            import pynvml
            pynvml.nvmlInit()
            count = pynvml.nvmlDeviceGetCount()
            self._gpu_handles = [pynvml.nvmlDeviceGetHandleByIndex(i) for i in range(count)]
            self._pynvml = pynvml
            print(f"[Local] 检测到 {count} 张 GPU")
        except ImportError:
            pass
        except Exception as e:
            print(f"[Local] GPU 初始化失败: {e}")

    def _sample_gpu(self):
        if not self._pynvml:
            return (None, None)
        try:
            total_mem = 0.0; total_util = 0.0
            for h in self._gpu_handles:
                mem = self._pynvml.nvmlDeviceGetMemoryInfo(h)
                util = self._pynvml.nvmlDeviceGetUtilizationRates(h)
                total_mem += mem.used / 1024**2
                total_util += util.gpu
            n = max(len(self._gpu_handles), 1)
            return (total_mem, total_util / n)
        except Exception:
            return (None, None)

    def _find_pid_by_port(self, port: int) -> Optional[int]:
        try:
            for conn in psutil.net_connections(kind='tcp'):
                if conn.laddr.port == port and conn.status == 'LISTEN':
                    return conn.pid
        except psutil.AccessDenied:
            pass
        try:
            import subprocess
            result = subprocess.run(
                ['lsof', '-i', f':{port}', '-sTCP:LISTEN', '-t', '-P', '-n'],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0 and result.stdout.strip():
                return int(result.stdout.strip().split('\n')[0])
        except Exception:
            pass
        return None

    def start(self, server_port: Optional[int] = None):
        if server_port:
            pid = self._find_pid_by_port(server_port)
            if pid:
                self.target_pid = pid
                print(f"[Local] 端口 {server_port} -> PID={pid}")
            else:
                print(f"[Local] 警告：未找到监听端口 {server_port} 的进程")

        if self.target_pid:
            try:
                self._proc = psutil.Process(self.target_pid)
                print(f"[Local] 目标进程: {self._proc.name()} (PID={self.target_pid})")
            except psutil.NoSuchProcess:
                print(f"[Local] 警告：PID {self.target_pid} 不存在")
                self._proc = None
        else:
            print("[Local] 未指定目标进程，仅监控系统整体资源")

        print(f"[Local] 本地监控已启动（采样间隔 {SAMPLE_INTERVAL}s）")
        self._start_time = time.time()
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._sample_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        if self._pynvml:
            try: self._pynvml.nvmlShutdown()
            except: pass
        print("[Local] 本地监控已停止")

    def mark_start(self, test_name: str):
        with self._lock:
            idx = len(self.samples)
            seg = TestSegment(name=test_name, start_idx=idx, end_idx=idx)
            self.segments.append(seg)
            print(f"\n[Monitor] >>> {test_name} 开始 @ {time.strftime('%H:%M:%S')}")

    def mark_end(self, test_name: str):
        with self._lock:
            idx = len(self.samples)
            for seg in reversed(self.segments):
                if seg.name == test_name and seg.end_idx == seg.start_idx:
                    seg.end_idx = idx
                    break
            print(f"[Monitor] <<< {test_name} 结束 @ {time.strftime('%H:%M:%S')}")

    def _sample_loop(self):
        prev_io_read = 0; prev_io_write = 0
        while not self._stop_event.is_set():
            sample_time = time.time() - self._start_time
            cpu = 0.0; mem_rss = 0.0; mem_vms = 0.0
            io_read = 0.0; io_write = 0.0

            if self._proc:
                try:
                    cpu = self._proc.cpu_percent(interval=0.1)
                    mi = self._proc.memory_info()
                    mem_rss = mi.rss / 1024**2
                    mem_vms = mi.vms / 1024**2
                    try:
                        io_counters = self._proc.io_counters()
                        io_read = max(0, (io_counters.read_bytes - prev_io_read) / 1024**2)
                        io_write = max(0, (io_counters.write_bytes - prev_io_write) / 1024**2)
                        prev_io_read = io_counters.read_bytes
                        prev_io_write = io_counters.write_bytes
                    except (psutil.AccessDenied, AttributeError):
                        pass
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass

            try:
                sys_cpu = psutil.cpu_percent(interval=0)
            except:
                sys_cpu = 0.0

            gpu_mem, gpu_util = self._sample_gpu()

            sample = ResourceSample(
                timestamp=sample_time,
                cpu_percent=cpu,
                memory_rss_mb=mem_rss,
                memory_vms_mb=mem_vms,
                io_read_mb=io_read,
                io_write_mb=io_write,
                gpu_mem_mb=gpu_mem,
                gpu_util=gpu_util,
                system_cpu_percent=sys_cpu,
            )
            with self._lock:
                self.samples.append(sample)
            time.sleep(SAMPLE_INTERVAL)

    def build_segments(self):
        for seg in self.segments:
            seg.samples = self.samples[seg.start_idx:seg.end_idx]


# ========================= 报告生成 =========================

def generate_report(monitor, output_dir: Path):
    """生成 CSV 日志和汇总 JSON 报告。"""
    monitor.build_segments()
    output_dir.mkdir(parents=True, exist_ok=True)

    # 全量 CSV
    full_csv = output_dir / "resource_log.csv"
    with open(full_csv, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "timestamp_s", "sys_cpu_%", "mem_used_mb", "mem_total_mb",
            "gpu_mem_mb", "gpu_util_%"
        ])
        for s in monitor.samples:
            writer.writerow([
                f"{s.timestamp:.1f}", f"{s.cpu_percent:.1f}",
                f"{s.memory_rss_mb:.1f}", f"{s.memory_vms_mb:.1f}",
                f"{s.gpu_mem_mb:.0f}" if s.gpu_mem_mb is not None else "",
                f"{s.gpu_util:.1f}" if s.gpu_util is not None else "",
            ])
    print(f"\n全量资源日志: {full_csv}")

    # 按测试分段 CSV
    test_summaries = []
    for seg in monitor.segments:
        if not seg.samples:
            continue
        seg_csv = output_dir / f"{seg.name}.csv"
        with open(seg_csv, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([
                "timestamp_s", "sys_cpu_%", "mem_used_mb", "mem_total_mb",
                "gpu_mem_mb", "gpu_util_%"
            ])
            for s in seg.samples:
                writer.writerow([
                    f"{s.timestamp:.1f}", f"{s.cpu_percent:.1f}",
                    f"{s.memory_rss_mb:.1f}", f"{s.memory_vms_mb:.1f}",
                    f"{s.gpu_mem_mb:.0f}" if s.gpu_mem_mb is not None else "",
                    f"{s.gpu_util:.1f}" if s.gpu_util is not None else "",
                ])
        summary = {
            "name": seg.name,
            "duration_s": round(seg.duration, 1),
            "samples": len(seg.samples),
            "sys_cpu_mean_%": round(seg.cpu_mean, 1),
            "sys_cpu_max_%": round(seg.cpu_max, 1),
            "mem_used_mean_mb": round(seg.mem_mean, 1),
            "mem_used_max_mb": round(seg.mem_max, 1),
            "mem_total_mb": round(seg.samples[0].memory_vms_mb, 0) if seg.samples else None,
            "gpu_mem_mean_mb": round(seg.gpu_mean, 1) if seg.gpu_mean else None,
            "gpu_mem_max_mb": round(seg.gpu_max, 1) if seg.gpu_max else None,
            "gpu_util_mean_%": round(seg.gpu_util_mean, 1) if seg.gpu_util_mean else None,
            "gpu_util_peak_%": round(seg.gpu_util_max, 1) if seg.gpu_util_max else None,
        }
        test_summaries.append(summary)

    # 汇总 JSON
    summary = {
        "test_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "remote_host": getattr(monitor, "host", "localhost"),
        "total_samples": len(monitor.samples),
        "total_duration_s": round(
            monitor.samples[-1].timestamp if monitor.samples else 0, 1
        ),
        "sample_interval_s": monitor.sample_interval if hasattr(monitor, 'sample_interval') else SAMPLE_INTERVAL,
        "dmon_granularity_ms": 50,  # 持续 dmon -d 0.05
        "clock_offset_ms": round(monitor._clock_offset * 1000, 1),
        "tests": test_summaries,
    }
    summary_json = output_dir / "summary.json"
    with open(summary_json, "w") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    print(f"汇总报告: {summary_json}")

    # 控制台汇总
    print("\n" + "=" * 80)
    print("服务器系统级资源占用汇总")
    print(f"(dmon 50ms粒度连续采集 | 时钟偏移: {monitor._clock_offset*1000:+.1f}ms)")
    print("=" * 80)
    header = f"{'测试项目':<22} {'时长':>6} {'系统CPU均值':>12} {'系统CPU峰值':>12} {'内存已用均值':>12} {'内存已用峰值':>12}"
    if any(t.get("gpu_mem_mean_mb") for t in test_summaries):
        header += f" {'GPU显存均值':>12} {'GPU显存峰值':>12}"
    print(header)
    print("-" * 80)
    for t in test_summaries:
        line = (
            f"{t['name']:<22} {t['duration_s']:>5.0f}s {t['sys_cpu_mean_%']:>11.1f}% {t['sys_cpu_max_%']:>11.1f}% "
            f"{t['mem_used_mean_mb']:>11.0f}M {t['mem_used_max_mb']:>11.0f}M"
        )
        if t.get("gpu_mem_mean_mb"):
            line += f" {t['gpu_mem_mean_mb']:>11.0f}M {t['gpu_mem_max_mb']:>11.0f}M"
        print(line)
    print("=" * 80)


# ========================= 测试包装器 =========================

async def run_test_with_monitor(monitor, test_func, test_name: str):
    monitor.mark_start(test_name)
    try:
        await test_func()
    except Exception as e:
        print(f"\n[Monitor] {test_name} 异常: {e}")
    finally:
        monitor.mark_end(test_name)


async def main_async(monitor, bench_module):
    """逐个子测试运行 benchmark，每个子测试独立标段以记录分段资源。"""
    import statistics
    import httpx

    print("\n" + "=" * 70)
    print("阶段 0: 连通性检查")
    print("=" * 70)
    async with httpx.AsyncClient(verify=bench_module.VERIFY_SSL) as client:
        ok = await bench_module.check_connectivity(client)
        if not ok:
            print("连通性检查失败。")
            return

    # ---------- 测试一：吞吐率 & TTFT（按 prompt 类型分段）----------
    print("\n" + "=" * 70)
    print("测试一：吞吐率 & 首字符响应时间 (TTFT)")
    print("=" * 70)
    async with httpx.AsyncClient(verify=bench_module.VERIFY_SSL) as client:
        for name, prompt in bench_module.TEST_PROMPTS.items():
            seg_name = f"1_throughput_{name}"
            print(f"\n> 提示词类型: {name} (约{bench_module.token_count_approx(prompt)} tokens)")
            monitor.mark_start(seg_name)
            try:
                for _ in range(bench_module.WARMUP_ROUNDS):
                    await bench_module.send_stream_request(client, prompt)
                results = []
                for i in range(bench_module.TEST_ROUNDS):
                    r = await bench_module.send_stream_request(client, prompt)
                    results.append(r)
                    if r.error:
                        print(f"  第 {i+1} 次错误: {r.error}")
                    else:
                        print(f"  第 {i+1} 次: TTFT={r.ttft_ms:.0f}ms, "
                              f"总耗时={r.total_ms:.0f}ms, "
                              f"输出={r.completion_len} tokens, "
                              f"吞吐={r.tokens_per_sec:.1f} tok/s")
                valid = [r for r in results if not r.error]
                if valid:
                    ttfts = [r.ttft_ms for r in valid]
                    tpss = [r.tokens_per_sec for r in valid]
                    print(f"  >> 平均: TTFT={statistics.mean(ttfts):.0f}ms, "
                          f"吞吐={statistics.mean(tpss):.1f} tok/s")
                else:
                    print("  >> 全部失败")
            finally:
                monitor.mark_end(seg_name)

    # ---------- 测试二：并发（按并发级别分段）----------
    print("\n" + "=" * 70)
    print("测试二：并发数测试")
    print("=" * 70)
    prompt = bench_module.TEST_PROMPTS["medium"]
    async with httpx.AsyncClient(verify=bench_module.VERIFY_SSL) as client:
        for n in bench_module.MAX_CONCURRENT:
            seg_name = f"2_concurrency_{n}"
            print(f"\n> 并发数: {n}")
            monitor.mark_start(seg_name)
            try:
                tasks = [bench_module.send_stream_request(client, prompt) for _ in range(n)]
                start = time.perf_counter()
                results = await asyncio.gather(*tasks)
                wall_time = time.perf_counter() - start
                errors = [r for r in results if r.error]
                valid = [r for r in results if not r.error]
                if errors:
                    print(f"  失败 {len(errors)}/{n}: {errors[0].error[:80]}")
                if valid:
                    total_tokens = sum(r.completion_len for r in valid)
                    avg_ttft = statistics.mean([r.ttft_ms for r in valid])
                    throughput = total_tokens / wall_time if wall_time > 0 else 0
                    print(f"  有效: {len(valid)}/{n}, 总耗时: {wall_time:.1f}s, "
                          f"吞吐: {throughput:.1f} tok/s, 平均TTFT: {avg_ttft:.0f}ms")
                else:
                    print(f"  全部失败")
            finally:
                monitor.mark_end(seg_name)

    # ---------- 测试三：上下文长度（按长度分段）----------
    print("\n" + "=" * 70)
    print("测试三：上下文长度测试")
    print("=" * 70)
    lengths = [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 1000000]
    base_unit = "人工智能是计算机科学的一个重要分支。"
    base_text = base_unit * 75000

    def _build_prompt(target_tokens: int) -> str:
        low, high = 0, len(base_text)
        while low < high:
            mid = (low + high) // 2
            if bench_module.token_count_approx(base_text[:mid]) < target_tokens:
                low = mid + 1
            else:
                high = mid
        return base_text[:low]

    async with httpx.AsyncClient(verify=bench_module.VERIFY_SSL) as client:
        for target_len in lengths:
            seg_name = f"3_context_{target_len}"
            prompt = _build_prompt(target_len)
            actual_len = bench_module.token_count_approx(prompt)
            print(f"\n> 目标上下文: {target_len} tokens (实际约 {actual_len} tokens)")
            monitor.mark_start(seg_name)
            should_break = False
            try:
                r = await bench_module.send_stream_request(client, prompt, timeout=600)
                if r.error:
                    print(f"  失败: {r.error[:100]}")
                    if "context" in r.error.lower() or "length" in r.error.lower():
                        print(f"  >> 推测上下文窗口上限约在 {target_len} tokens 附近")
                        should_break = True
                else:
                    print(f"  成功: TTFT={r.ttft_ms:.0f}ms, 输出={r.completion_len} tokens")
            except Exception as e:
                print(f"  异常: {e}")
                should_break = True
            finally:
                monitor.mark_end(seg_name)
            if should_break:
                break

    # ---------- 测试四：显存消耗（单段）----------
    await run_test_with_monitor(monitor, bench_module.test_memory_estimation, "4_memory_estimation")


# ========================= 入口 =========================

def main():
    parser = argparse.ArgumentParser(
        description="DeepSeek V4 Benchmark 资源监控集成脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例：
  # 本地模式
  python deepseek_v4_bench_monitor.py --server-port 13206

  # 远程 SSH 模式
  python deepseek_v4_bench_monitor.py --ssh-host 10.255.12.38 --ssh-user root --server-port 13206

  # 远程 + 密钥
  python deepseek_v4_bench_monitor.py --ssh-host 10.255.12.38 --ssh-user root --ssh-key ~/.ssh/id_rsa --server-port 30466
        """
    )
    # 目标服务
    parser.add_argument("--server-port", type=int, help="服务监听端口（用于自动查找进程 PID）")
    parser.add_argument("--server-pid", type=int, help="直接指定进程 PID（仅本地模式）")

    # SSH 远程模式
    parser.add_argument("--ssh-host", type=str, help="远程服务器 IP/域名（启用远程 SSH 监控）")
    parser.add_argument("--ssh-port", type=int, default=22, help="SSH 端口（默认 22）")
    parser.add_argument("--ssh-user", type=str, default="root", help="SSH 用户名（默认 root）")
    parser.add_argument("--ssh-password", type=str, help="SSH 密码（不推荐，优先用密钥）")
    parser.add_argument("--ssh-key", type=str, help="SSH 私钥路径（默认 ~/.ssh/id_rsa）")
    parser.add_argument("--ssh-alias", type=str, help="SSH ~/.ssh/config 别名（与 --ssh-key 互斥，优先使用）")

    # 其他
    parser.add_argument("--sample-interval", type=float, default=SAMPLE_INTERVAL, help="采样间隔（秒，默认 0.1；GPU 持久流式，CPU/内存按此间隔轮询）")
    parser.add_argument("--verify-only", action="store_true", help="仅做 SSH 环境验证，不运行 benchmark")
    args = parser.parse_args()

    # ---- 导入 benchmark 模块 ----
    bench_path = Path(__file__).parent / "deepseek_v4_bench.py"
    if not bench_path.exists():
        print(f"错误：找不到 {bench_path}")
        sys.exit(1)

    import importlib.util
    spec = importlib.util.spec_from_file_location("deepseek_v4_bench", str(bench_path))
    bench = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bench)

    run_dir = OUTPUT_DIR / datetime.now().strftime("%Y%m%d_%H%M%S")

    # ---- 选择监控模式 ----
    if args.ssh_host or args.ssh_alias:
        # 远程 SSH 模式
        monitor = SSHRemoteMonitor(
            host=args.ssh_host or "",
            port=args.ssh_port,
            user=args.ssh_user,
            password=args.ssh_password,
            key_path=args.ssh_key,
            ssh_alias=args.ssh_alias,
            sample_interval=args.sample_interval,
        )
    else:
        # 本地 psutil 模式
        monitor = LocalMonitor(target_pid=args.server_pid)

    monitor.start(server_port=args.server_port)

    # --verify-only：仅验证，不跑 benchmark
    if args.verify_only and (args.ssh_host or args.ssh_alias):
        print("\n[验证模式] 环境检查完成，跳过 benchmark。")
        monitor.stop()
        return

    print(f"\n输出目录: {run_dir}")
    print(f"目标接口: {bench.ENDPOINT}")
    print(f"模型: {bench.MODEL_NAME}")
    if args.ssh_host or args.ssh_alias:
        target = args.ssh_alias or f"{args.ssh_user}@{args.ssh_host}"
        print(f"监控模式: 远程 SSH ({target})")
    else:
        print(f"监控模式: 本地 psutil")

    # ---- 运行测试 ----
    try:
        import asyncio
        asyncio.run(main_async(monitor, bench))
    except KeyboardInterrupt:
        print("\n用户中断")
    finally:
        monitor.stop()

    # ---- 生成报告 ----
    generate_report(monitor, run_dir)
    print(f"\n所有结果已保存至: {run_dir}")
    for f in sorted(run_dir.iterdir()):
        print(f"  {f.name}")


if __name__ == "__main__":
    main()
