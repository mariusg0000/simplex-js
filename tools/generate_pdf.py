"""
tools/generate_pdf.py · Convert HTML to PDF with auto-termination on success.
On success returns _AGENT_DONE_ with the PDF filename.
"""

import sys
from pathlib import Path
from typing import Optional

SCRIPTS_VENV = Path.home() / ".simplexai" / "scripts" / ".venv"


def _ensure_weasyprint_in_path() -> None:
    site_pkgs = SCRIPTS_VENV / "lib"
    if site_pkgs.exists():
        for d in sorted(site_pkgs.iterdir()):
            if d.is_dir() and d.name.startswith("python"):
                sp = d / "site-packages"
                if sp.exists() and str(sp) not in sys.path:
                    sys.path.insert(0, str(sp))
                    return


def get_visibility() -> dict:
    return {"main_agent": False}


def get_description() -> dict:
    return {
        "name": "generate_pdf",
        "description": "Convert an HTML file to PDF. On success, auto-terminates the agent.",
        "parameters": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Relative HTML filename to convert (e.g., 'index.html').",
                },
            },
            "required": ["filename"],
        },
    }


async def execute(filename: str, _agent_params: Optional[dict] = None) -> str:
    if not _agent_params or "work_dir" not in _agent_params:
        return "Error: generate_pdf requires a session folder (work_dir)."

    work_dir = _agent_params["work_dir"]
    html_path = Path(work_dir) / filename

    if not html_path.exists():
        return f"Error: HTML file not found: {filename}"
    if not html_path.is_file():
        return f"Error: not a file: {filename}"

    pdf_filename = html_path.with_suffix(".pdf").name
    pdf_path = Path(work_dir) / pdf_filename

    _ensure_weasyprint_in_path()

    try:
        from weasyprint import HTML
        HTML(str(html_path)).write_pdf(str(pdf_path))
    except ImportError:
        return "Error: weasyprint is not installed in the scripts environment. Install with: pip install weasyprint"
    except Exception as e:
        return f"Error converting {filename} to PDF: {e}"

    size = pdf_path.stat().st_size
    if size < 500:
        return f"Error: generated PDF is only {size} bytes — likely empty or broken. Fix the HTML/CSS and retry."

    return f"_AGENT_DONE_: {pdf_filename}"
