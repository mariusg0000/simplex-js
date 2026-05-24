"""
tools/run_python.py · Execute a Python file with sandbox awareness.
Relative filenames resolve against work_dir when present.
"""

import asyncio
import os
from pathlib import Path
from typing import Optional

SCRIPTS_VENV = Path.home() / ".simplexai" / "scripts" / ".venv"
SCRIPTS_VENV_BIN = str(SCRIPTS_VENV / "bin")

MAX_LINES = 500
MAX_CHARS = 50 * 1024
TIMEOUT = 60


def get_description() -> dict:
    return {
        "name": "run_python",
        "description": "Execute a Python file. Sub-agents must use relative filenames resolved against the session folder.",
        "parameters": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Python file to execute. Relative for sub-agents, absolute for main agent.",
                },
                "timeout": {
                    "type": "integer",
                    "description": "Maximum execution time in seconds (default: 60, max: 120).",
                },
            },
            "required": ["filename"],
        },
    }


async def execute(filename: str, timeout: int = TIMEOUT, _agent_params: Optional[dict] = None) -> str:
    if _agent_params and "work_dir" in _agent_params:
        if Path(filename).is_absolute():
            return "Error: sub-agents cannot use absolute paths. Use a relative filename."
        script_path = Path(_agent_params["work_dir"]) / filename
        cwd = Path(_agent_params["work_dir"])
    else:
        script_path = Path(filename)
        cwd = script_path.parent if script_path.parent != Path(".") else None

    if not script_path.exists():
        return f"Error: file not found: {filename}"
    if not script_path.is_file():
        return f"Error: not a file: {filename}"

    if timeout < 1:
        timeout = 1
    if timeout > 120:
        timeout = 120

    env = os.environ.copy()
    env["PATH"] = f"{SCRIPTS_VENV_BIN}:{env['PATH']}"

    try:
        process = await asyncio.create_subprocess_exec(
            "python3", str(script_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(cwd) if cwd else None,
            env=env,
        )

        try:
            stdout, _ = await asyncio.wait_for(process.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            return f"Error: Python execution timed out after {timeout}s. File: {filename}"

        output = stdout.decode("utf-8", errors="replace").strip()
        lines = output.split("\n")
        if len(lines) > MAX_LINES:
            output = "\n".join(lines[:MAX_LINES])
            output += f"\n[Output truncated: {len(lines) - MAX_LINES} lines removed]"

        if len(output) > MAX_CHARS:
            output = output[:MAX_CHARS]
            output += f"\n[Output truncated: {len(output) - MAX_CHARS} chars removed]"

        exit_code = process.returncode
        if exit_code == 0:
            if output:
                return output
            return f"Success: {filename} executed with no output."
        return f"Exit code {exit_code}:\n{output}"

    except FileNotFoundError:
        return "Error: python3 not found. Ensure Python 3 is installed."
    except Exception as e:
        return f"Error executing {filename}: {e}"
