"""
tools/read_document.py · Read common document formats with sandbox awareness.
Sub-agents use relative filenames resolved against work_dir.
"""

from pathlib import Path
import importlib
from typing import Optional

MAX_CHARS = 50_000


def _read_text(path: Path) -> str:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read(MAX_CHARS)


def _read_pdf(path: Path) -> str:
    try:
        PdfReader = importlib.import_module("pypdf").PdfReader
    except ImportError as e:
        raise RuntimeError("pypdf is not installed") from e

    reader = PdfReader(path)
    text = ""
    for page in reader.pages:
        page_text = page.extract_text() or ""
        text += page_text + "\n"
        if len(text) > MAX_CHARS:
            break
    return text[:MAX_CHARS]


def _read_docx(path: Path) -> str:
    from docx import Document

    doc = Document(str(path))
    text = "\n".join([para.text for para in doc.paragraphs])
    return text[:MAX_CHARS]


def _read_excel(path: Path) -> str:
    import pandas as pd

    df = pd.read_excel(path, nrows=50)
    return df.to_string()


def get_description() -> dict:
    return {
        "name": "read_document",
        "description": "Reads the text content of a document. Supports .txt, .md, .pdf, .docx, .xlsx.",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Relative filename (sub-agent) or absolute path (main agent).",
                },
            },
            "required": ["file_path"],
        },
    }


async def execute(file_path: str, _agent_params: Optional[dict] = None) -> str:
    if _agent_params and "work_dir" in _agent_params:
        if Path(file_path).is_absolute():
            return "Error: sub-agents cannot use absolute paths. Use a relative filename."
        path = Path(_agent_params["work_dir"]) / file_path
    else:
        path = Path(file_path)

    if not path.exists():
        return f"Error: File not found at {file_path}"

    ext = path.suffix.lower()
    try:
        if ext in (".txt", ".md", ".py", ".json", ".yaml", ".yml"):
            content = _read_text(path)
        elif ext == ".pdf":
            content = _read_pdf(path)
        elif ext == ".docx":
            content = _read_docx(path)
        elif ext in (".xlsx", ".xls"):
            content = _read_excel(path)
        else:
            return f"Error: Unsupported file format '{ext}'"

        if not content.strip():
            return "The file appears to be empty."

        return f"--- Content of {path.name} ---\n{content}\n--- End of Content ---"

    except Exception as e:
        return f"Error reading file {path.name}: {str(e)}"
