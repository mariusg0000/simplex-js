"""Tool: bash — run shell commands."""


def get_description():
    return {
        "name": "bash",
        "description": "Execute a shell command.",
        "parameters": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "The shell command to run."},
            },
            "required": ["command"],
        },
    }


def execute(command, _agent_params=None):
    import subprocess
    result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=30)
    return {"stdout": result.stdout, "stderr": result.stderr, "exit_code": result.returncode}
