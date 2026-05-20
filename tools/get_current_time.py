"""Tool: get_current_time — return current date and time."""

from datetime import datetime


def get_description():
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


def execute(timezone=None):
    return {"current_time": datetime.now().isoformat()}
