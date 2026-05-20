"""Tool: task_done — signal that an agent task is complete."""


def get_description():
    return {
        "name": "task_done",
        "description": "Signal that the current agent task is complete.",
        "parameters": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "Summary of what was accomplished."}
            },
        },
    }


def execute(summary=""):
    return {"done": True, "summary": summary}
