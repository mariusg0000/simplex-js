"""
tools/task_done.py · Sub-agent task completion signal.
Terminates a sub-agent loop with an optional result and validates relative
filenames against the current work_dir when present.
"""

from pathlib import Path
from typing import Optional


def get_description() -> dict:
    return {
        "name": "task_done",
        "description": (
            "Signal task completion. Call this when your task is finished, "
            "passing the result filename (relative, e.g., 'output.pdf') or a short summary."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "result": {
                    "type": "string",
                    "description": (
                        "The result of the task — a relative filename "
                        "(e.g., 'output.pdf') or a short summary."
                    ),
                },
            },
            "required": ["result"],
        },
    }


async def execute(result: str, _agent_params: Optional[dict] = None) -> str:
    if _agent_params and "work_dir" in _agent_params:
        if " " in result or len(result) > 200:
            return f"_AGENT_DONE_: {result}"

        result_path = Path(result)
        if result_path.is_absolute():
            return (
                "Error: sub-agents must use relative filenames. "
                "Use just the filename (e.g., 'output.pdf')."
            )

        work_dir = _agent_params["work_dir"]
        full_path = Path(work_dir) / result_path

        try:
            full_path.relative_to(Path(work_dir))
        except ValueError:
            return (
                f"Error: File '{result}' resolves outside the session folder "
                f"'{work_dir}'. Create files only inside your workspace."
            )

        if not full_path.is_file():
            return (
                f"Error: File not found at '{result}'. "
                "Verify the file was created successfully before calling task_done."
            )

    return f"_AGENT_DONE_: {result}"
