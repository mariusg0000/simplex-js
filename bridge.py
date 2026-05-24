#!/usr/bin/env python3
"""Simplex Python Bridge — CLI for tool inspection and execution."""

import sys
import json
import importlib.util
import re
import os
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


def load_module(path):
    spec = importlib.util.spec_from_file_location("tool_module", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load module from {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def cmd_inspect(tool_path):
    mod = load_module(tool_path)
    schema = mod.get_description()
    print(json.dumps(schema))


def cmd_execute(tool_path, args_json):
    mod = load_module(tool_path)
    args = json.loads(args_json) if args_json else {}
    result = mod.execute(**args)
    if asyncio.iscoroutine(result):
        result = asyncio.run(result)
    print(json.dumps(result))


def cmd_inspect_agent(agent_path):
    with open(agent_path) as f:
        content = f.read()
    name_match = re.search(r"^#\s+(.+)", content, re.M)
    role_match = re.search(r"## Role\s*\n(.+?)(?=\n##|\Z)", content, re.S)
    tools_match = re.search(r"## Allowed Tools\s*\n(.+?)(?=\n##|\Z)", content, re.S)
    result = {
        "name": name_match.group(1).strip() if name_match else os.path.basename(agent_path),
        "role": role_match.group(1).strip() if role_match else "",
        "allowed_tools": [
            t.strip().lstrip("- ")
            for t in (tools_match.group(1).strip().split("\n") if tools_match else [])
        ],
    }
    print(json.dumps(result))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: bridge.py <inspect|execute|inspect-agent> [args...]", file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1]

    if command == "inspect" and len(sys.argv) >= 3:
        cmd_inspect(sys.argv[2])
    elif command == "execute" and len(sys.argv) >= 4:
        cmd_execute(sys.argv[2], sys.argv[3])
    elif command == "inspect-agent" and len(sys.argv) >= 3:
        cmd_inspect_agent(sys.argv[2])
    else:
        print(f"Unknown command or missing arguments: {command}", file=sys.stderr)
        sys.exit(1)
