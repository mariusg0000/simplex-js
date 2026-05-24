"""
tools/list_files.py · List files in a directory with sandbox awareness.
When _agent_params contains work_dir, lists files only in that directory.
"""

from pathlib import Path
from typing import Optional


def get_description() -> dict:
    return {
        "name": "list_files",
        "description": (
            "List files in a directory. Sub-agents see only their session folder. "
            "Main agents can specify any directory."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": (
                        "Directory to list. Sub-agents MUST use '.' or omit this "
                        "(defaults to session folder). Main agents can use any path."
                    ),
                },
                "detail": {
                    "type": "boolean",
                    "description": "If True, include file sizes. Default: False.",
                },
            },
            "required": [],
        },
    }


async def execute(path: str = ".", detail: bool = False, _agent_params: Optional[dict] = None) -> str:
    if _agent_params and "work_dir" in _agent_params:
        target = Path(_agent_params["work_dir"])
    else:
        target = Path(path)

    if not target.exists():
        return f"Error: directory not found: {path}"
    if not target.is_dir():
        return f"Error: not a directory: {path}"

    try:
        entries = sorted(target.iterdir())
        if not entries:
            return "(empty directory)"

        lines = []
        for entry in entries:
            if detail:
                size = entry.stat().st_size if entry.is_file() else 0
                lines.append(f"{'[dir]' if entry.is_dir() else '[file]':5s} {size:>10,}  {entry.name}")
            else:
                prefix = "d " if entry.is_dir() else "  "
                lines.append(f"{prefix}{entry.name}")

        return "\n".join(lines)
    except Exception as e:
        return f"Error listing {path}: {e}"
