#!/usr/bin/env python3
"""safe_write.py — 写入 40% 保护拦截器（OWB 迁移 4）

防「没读全就重写」的灾难：一次写入若砍掉现成文件 40% 以上内容，直接拦截。

用法：
  python3 safe_write.py <目标文件> [--content-file 新内容文件] [--overwrite]
  # 或 stdin:  echo "新内容" | python3 safe_write.py 目标文件

退出码：
  0 = 写入成功
  1 = 参数/IO 错误
  2 = 被 40% 保护拦截（加 --overwrite 明示放行）
"""
import sys
import os
import argparse

SHRINK_LIMIT = 0.40  # 缩水 ≥40% 拦截


def main():
    ap = argparse.ArgumentParser(description="带 40% 缩水保护的写入")
    ap.add_argument("file", help="目标文件")
    ap.add_argument("--content-file", help="新内容文件（缺省读 stdin）")
    ap.add_argument("--overwrite", action="store_true", help="明示覆盖，跳过 40% 拦截")
    args = ap.parse_args()

    if args.content_file:
        try:
            with open(args.content_file, encoding="utf-8", errors="replace") as f:
                new = f.read()
        except OSError as e:
            print(f"[读新内容失败: {e}]", file=sys.stderr)
            sys.exit(1)
    else:
        new = sys.stdin.read()

    if not args.overwrite and os.path.isfile(args.file):
        try:
            with open(args.file, encoding="utf-8", errors="replace") as f:
                old = f.read()
        except OSError:
            old = None
        if old is not None and old.strip():
            old_len, new_len = len(old.strip()), len(new.strip())
            if new_len < old_len * (1 - SHRINK_LIMIT):
                ratio = (1 - new_len / old_len) * 100 if old_len else 0
                print(
                    f"[40% 保护拦截] 现文件 {old_len} 字，新内容仅 {new_len} 字"
                    f"（缩水 {ratio:.1f}% ≥ {SHRINK_LIMIT*100:.0f}%）。\n"
                    f"疑似「没读全就重写」。确认要砍请加 --overwrite；"
                    f"否则先跑 read_document.py 拍平读取全文再重写。",
                    file=sys.stderr,
                )
                sys.exit(2)

    # 原子写
    tmp = args.file + ".tmp-sw"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(new)
        os.replace(tmp, args.file)
    except OSError as e:
        print(f"[写入失败: {e}]", file=sys.stderr)
        sys.exit(1)
    print(f"[写入成功] {args.file} ({len(new)} 字)")


if __name__ == "__main__":
    main()
