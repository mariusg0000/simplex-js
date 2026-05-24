"""
tools/read_file.py · Read file contents with sandbox awareness.
When _agent_params contains work_dir, relative filenames are resolved against it.
"""

from pathlib import Path
from typing import Optional

MAX_BYTES = 80_000


def get_description() -> dict:
    return {
        "name": "read_file",
        "description": (
            "Read a file's contents. Limit: ~80KB. "
            "Sub-agents may use a relative filename resolved against the session folder."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Relative filename (sub-agent) or absolute path (main agent).",
                },
            },
            "required": ["filename"],
        },
    }


async def execute(filename: str, _agent_params: Optional[dict] = None) -> str:
    if _agent_params and "work_dir" in _agent_params:
        target = Path(_agent_params["work_dir"]) / filename
    else:
        target = Path(filename)

    if not target.exists():
        return f"Error: file not found: {filename}"
    if not target.is_file():
        return f"Error: not a file: {filename}"

    stat = target.stat()
    if stat.st_size > MAX_BYTES:
        return f"Error: file too large ({stat.st_size} bytes, max {MAX_BYTES}). File: {filename}"

    return target.read_bytes().decode("utf-8", errors="replace")
