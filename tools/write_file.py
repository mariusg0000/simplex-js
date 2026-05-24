"""
tools/write_file.py · Write content to a file with sandbox awareness.
Relative filenames resolve against work_dir when present.
"""

from pathlib import Path
from typing import Optional

MAX_BYTES = 500_000


def get_description() -> dict:
    return {
        "name": "write_file",
        "description": (
            "Write content to a file. Sub-agents must use relative filenames "
            "resolved against the session folder."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Relative filename (sub-agent) or absolute path (main agent).",
                },
                "content": {
                    "type": "string",
                    "description": "The text content to write to the file.",
                },
            },
            "required": ["filename", "content"],
        },
    }


async def execute(filename: str, content: str, _agent_params: Optional[dict] = None) -> str:
    if _agent_params and "work_dir" in _agent_params:
        if Path(filename).is_absolute():
            return "Error: sub-agents cannot use absolute paths. Use a relative filename."
        target = Path(_agent_params["work_dir"]) / filename
    else:
        target = Path(filename)

    if len(content.encode("utf-8")) > MAX_BYTES:
        return f"Error: content too large ({len(content)} bytes, max {MAX_BYTES}). Split into multiple files if needed."

    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return f"Written {filename} ({len(content)} bytes)"
    except Exception as e:
        return f"Error writing {filename}: {e}"
