"""
tools/open_file.py · Open a file, directory, or URL with the default app.
This tool does not use work_dir; it is not filesystem-mutating.
"""

import os
import platform
import subprocess
from typing import Optional


def get_description() -> dict:
    return {
        "name": "open_file",
        "description": "Open a file, directory, or URL with the default system application.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The file, directory, or URL to open.",
                },
            },
            "required": ["path"],
        },
    }


def execute(path: str, _agent_params: Optional[dict] = None) -> str:
    system = platform.system()
    try:
        if system == "Windows":
            startfile = getattr(os, "startfile", None)
            if startfile is None:
                return f"Error opening {path}: startfile is unavailable on this platform"
            startfile(path)
        elif system == "Darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
        return f"Opened with default application: {os.path.basename(path)}"
    except Exception as e:
        return f"Error opening {path}: {str(e)}"
