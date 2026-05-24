"""
tools/bash.py · Shell command execution tool with sandbox enforcement.
Executes shell commands, enforces working directory restrictions for sub-agents,
detects dangerous patterns, and supports user confirmation for destructive ops.
Depends on: asyncio.subprocess, ToolRegistry, storage (for working_directories config).
"""

import asyncio
import logging
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

SCRIPTS_VENV = Path.home() / ".simplexai" / "scripts" / ".venv"
SCRIPTS_VENV_BIN = str(SCRIPTS_VENV / "bin")

log = logging.getLogger("simplex.tools.bash")

MAX_LINES = 500
MAX_CHARS = 50 * 1024
SENTINEL = "___EXEC_RESULTS___"


@dataclass
class _AllowedDirs:
    paths: set[Path]

DANGEROUS_PATTERNS: list[tuple[str, str]] = [
    (r"\brm\b", "Deletes files/folders permanently."),
    (r"rmdir\b", "Deletes directories."),
    (r"git\s+clean\s+-[a-z]*[f]", "Deletes untracked files permanently."),
    (r"dd\s+.*of=/dev/\w", "Can overwrite/destroy disk partitions."),
    (r"mkfs\.", "Formats disk partitions (destroys all data)."),
    (r"(curl|wget).*\|.*(bash|sh|python|perl|ruby)", "Downloads and executes code from the internet."),
    (r"chmod\s+-[rR]?\s*777", "Gives write access to everyone — security risk."),
    (r">\s*/dev/sd[a-z]", "Redirects output to a block device — can corrupt disks."),
    (r"shutdown\b", "Shuts down the computer."),
    (r"reboot\b", "Restarts the computer."),
    (r"halt\b", "Halts the system."),
    (r"poweroff\b", "Powers off the computer."),
    (r"init\s+[06]\b", "Changes system runlevel (shutdown/reboot)."),
    (r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:", "Fork bomb — can freeze/crash the computer."),
    (r"sudo\s+", "Runs with administrator (root) privileges."),
    (r"\beval\b", "Evaluates arbitrary string as a command — bypass risk."),
    (r"(bash|sh)\s+-c\b", "Executes arbitrary string as a command — bypass risk."),
    (r"\bexec\b", "Replaces the shell process with a new command."),
]


def _check_dangerous(command: str) -> Optional[str]:
    cmd_normalized = command.strip().lower()
    reasons = []
    for pattern, description in DANGEROUS_PATTERNS:
        if re.search(pattern, cmd_normalized):
            reasons.append(description)
    return "; ".join(reasons) if reasons else None


def _truncate_output(text: str) -> str:
    lines = text.splitlines()
    if len(lines) > MAX_LINES:
        text = "\n".join(lines[:MAX_LINES])
        text += f"\n[Output truncated: {len(lines) - MAX_LINES} lines removed]"

    total_chars = len(text)
    if total_chars > MAX_CHARS:
        text = text[:MAX_CHARS]
        text += f"\n[Output truncated: {total_chars - MAX_CHARS} chars removed]"
    return text


def get_description() -> dict:
    return {
        "name": "bash",
        "description": "Execute a shell command and return its output (stdout + stderr combined). Output is truncated at 500 lines or 50 KB. Use this to run terminal commands, scripts, or system operations. Set need_confirmation=True for destructive commands.",
        "parameters": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The shell command to execute.",
                },
                "explanation": {
                    "type": "string",
                    "description": "Plain-language explanation of what this command does.",
                },
                "timeout": {
                    "type": "integer",
                    "description": "Maximum execution time in seconds (default: 30, max: 120).",
                },
                "need_confirmation": {
                    "type": "boolean",
                    "description": "Set to True if the command could be destructive.",
                },
                "workdir": {
                    "type": "string",
                    "description": "Working directory for the command.",
                },
            },
            "required": ["command", "explanation"],
        },
    }


async def execute(command: str, explanation: str, timeout: int = 30, need_confirmation: bool = False, workdir: Optional[str] = None, _agent_params: Optional[dict] = None) -> str:
    allowed_dirs = _AllowedDirs(paths=set())
    is_sub_agent = _agent_params is not None

    if is_sub_agent:
        sub_work_dir = Path(_agent_params["work_dir"]).resolve()
        allowed_dirs.paths = {sub_work_dir}

    def _check_in_allowed(target: Path, label: str) -> str | None:
        for ad in allowed_dirs.paths:
            try:
                target.relative_to(ad)
                return None
            except ValueError:
                continue
        dirs_str = ", ".join(str(d) for d in allowed_dirs.paths)
        return (
            f"Error: {label} '{target}' is outside the allowed directory/directories ({dirs_str}). "
            f"{'All files must stay inside your session folder (' + str(next(iter(allowed_dirs.paths))) + '). Use a relative path (e.g., cat > script.py << ...) or write to ' + str(next(iter(allowed_dirs.paths))) + '/filename.' if is_sub_agent else 'Configure working directories in Settings.'}"
        )

    if allowed_dirs.paths:
        if workdir:
            requested = Path(workdir).resolve()
            err = _check_in_allowed(requested, "workdir")
            if err:
                return err
            workdir = str(requested)
        elif is_sub_agent:
            workdir = str(next(iter(allowed_dirs.paths)))

        def _inspect_path(target: str) -> str | None:
            t = target.strip().strip('"\'')
            if t.startswith("~/"):
                t = str(Path.home() / t[2:])
            if t.startswith("/"):
                p = Path(t).resolve()
                err = _check_in_allowed(p, "command writes to")
                if err:
                    return str(p)
            return None

        parts = command.split()
        for i, token in enumerate(parts):
            if token in (">", ">>") and i + 1 < len(parts):
                off_limit = _inspect_path(parts[i + 1])
                if off_limit:
                    return (
                        f"Error: command writes to '{off_limit}' which is outside the allowed directory/directories ({', '.join(str(d) for d in allowed_dirs.paths)}). "
                        f"{'All files must stay inside your session folder.' if is_sub_agent else 'Configure working directories in Settings.'}"
                    )

    if isinstance(timeout, str):
        try:
            timeout = int(timeout)
        except (ValueError, TypeError):
            timeout = 30
    if isinstance(need_confirmation, str):
        need_confirmation = need_confirmation.lower() in ("true", "1", "yes")
    if isinstance(need_confirmation, int):
        need_confirmation = bool(need_confirmation)

    if timeout < 1:
        timeout = 1
    if timeout > 120:
        timeout = 120

    danger_reason = _check_dangerous(command)

    if need_confirmation or danger_reason:
        return "Confirmation required but no UI handler is registered."

    log.debug("Executing bash command (timeout=%ds): %s", timeout, command[:200])

    full_command = f"( {command} ); printf '\n{SENTINEL}:%s\n' \"$?\""

    try:
        env = os.environ.copy()
        env["PATH"] = f"{SCRIPTS_VENV_BIN}:{env['PATH']}"

        process = await asyncio.create_subprocess_shell(
            full_command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            stdin=asyncio.subprocess.DEVNULL,
            cwd=workdir,
            env=env,
        )

        try:
            stdout, _ = await asyncio.wait_for(
                process.communicate(), timeout=timeout
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            return "Error: Command timed out. Avoid long-running or interactive commands."

        output = stdout.decode("utf-8", errors="replace").strip()

        sentinel_marker = f"{SENTINEL}:"
        if sentinel_marker not in output:
            return _truncate_output(output) if output else "Success: Command finished with no output."

        lines = output.rsplit("\n", 1)
        if len(lines) == 2:
            actual_output = lines[0].strip()
            exit_code_line = lines[1]
        else:
            actual_output = ""
            exit_code_line = lines[0]

        exit_code = exit_code_line.replace(sentinel_marker, "").strip()

        if not actual_output:
            if exit_code == "0":
                return "Success: Command finished with no output."
            return f"Command failed with exit code {exit_code}."

        return _truncate_output(actual_output)

    except FileNotFoundError as e:
        return f"Error: Command not found — {str(e)}"
    except Exception as e:
        log.exception("Unexpected error in bash tool")
        return f"Error executing command: {str(e)}"
