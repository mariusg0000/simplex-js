"""Tool: get_current_time — return current date and time."""

from datetime import datetime
from typing import Optional


def get_description() -> dict:
    return {
        "name": "get_current_time",
        "description": "Get the current date and time.",
        "parameters": {
            "type": "object",
            "properties": {
                "timezone": {"type": "string", "description": "Timezone (optional)."}
            },
        },
    }


def execute(timezone: Optional[str] = None, _agent_params: Optional[dict] = None):
    return {"current_time": datetime.now().isoformat()}
