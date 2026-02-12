import json
import subprocess
import sys

# 读取配置文件
with open('xianyu_search_config.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

# 构建命令参数
cmd = [
    'python', 'run.py',
    '--skill', 'rpa_ts_skill',
]

# 添加配置参数
for key, value in config.items():
    if isinstance(value, dict):
        # 对于复杂对象，使用JSON字符串
        cmd.extend(['--set', f'{key}={json.dumps(value)}'])
    else:
        cmd.extend(['--set', f'{key}={value}'])

print(f"Running command: {' '.join(cmd)}")

# 运行命令
result = subprocess.run(cmd, capture_output=True, text=True)

print("\nCommand output:")
print(result.stdout)

if result.stderr:
    print("\nCommand error:")
    print(result.stderr)

print(f"\nReturn code: {result.returncode}")
