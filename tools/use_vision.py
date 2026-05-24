"""
tools/use_vision.py · Analyze an image with a vision model and write a detail file.
Writes the full analysis into the current work_dir when present.
"""

import base64
import io
import logging
import re
import uuid
from pathlib import Path
from typing import Optional

log = logging.getLogger("simplex.tools.use_vision")


def get_visibility() -> dict:
    return {"main_agent": True}


def get_description() -> dict:
    return {
        "name": "use_vision",
        "description": (
            "Analyze a scanned document, image, or photo using a vision AI model. "
            "Returns a short summary inline and writes the full analysis to a .md file in the session folder."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "image_path": {
                    "type": "string",
                    "description": "Absolute path to the image file.",
                },
                "request": {
                    "type": "string",
                    "description": "Detailed analysis request for the vision model.",
                },
            },
            "required": ["image_path", "request"],
        },
    }


async def execute(image_path: str, request: str, _agent_params: Optional[dict] = None) -> str:
    if not image_path or not request:
        return "Error: both 'image_path' and 'request' are required."

    target = Path(image_path)
    if not target.exists():
        return f"Error: image file not found: {image_path}"
    if not target.is_file():
        return f"Error: not a file: {image_path}"

    if _agent_params and "work_dir" in _agent_params:
        work_dir = _agent_params["work_dir"]
    else:
        return "Error: use_vision requires a session folder to write the detail file."

    try:
        from PIL import Image
    except ImportError:
        return "Error: Pillow is not installed."

    try:
        img = Image.open(target)
    except Exception as e:
        return f"Error: cannot open image '{image_path}': {e}"

    import os

    model_name_env = os.getenv("SIMPLEX_VISION_MODEL", "")
    api_key = os.getenv("SIMPLEX_VISION_API_KEY", "")
    api_base = os.getenv("SIMPLEX_VISION_API_BASE", "https://api.openai.com/v1")
    max_dim = int(os.getenv("SIMPLEX_VISION_MAX_DIMENSION", "2048"))

    if model_name_env:
        model_name = model_name_env
    else:
        model_name = os.getenv("SIMPLEX_CHAT_MODEL", "gpt-4o-mini")

    w, h = img.size
    if max(w, h) > max_dim:
        ratio = max_dim / max(w, h)
        new_w = int(w * ratio)
        new_h = int(h * ratio)
        img = img.resize((new_w, new_h), Image.LANCZOS)
        log.info("Scaled image from %dx%d to %dx%d", w, h, new_w, new_h)

    buffer = io.BytesIO()
    try:
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.save(buffer, format="JPEG", quality=90)
    except Exception as e:
        return f"Error: cannot encode image: {e}"

    b64_data = base64.b64encode(buffer.getvalue()).decode("utf-8")
    data_uri = f"data:image/jpeg;base64,{b64_data}"

    if not api_key:
        return "Error: vision model is not configured. Set SIMPLEX_VISION_MODEL and SIMPLEX_VISION_API_KEY."

    url = api_base.rstrip("/") + "/chat/completions"
    if model_name.startswith("openai/"):
        model_name = model_name[len("openai/"):]

    system_prompt = (
        "You are a precise document analyst. Respond with exactly TWO sections separated by a line containing ONLY the word `===FULL===`.\n"
        "First section: SHORT DESCRIPTION — exactly 1-2 sentences summarising what the document is and its key data.\n"
        "Second section: FULL DETAILED ANALYSIS — provide the exhaustive analysis exactly as requested by the user.\n"
        "Do NOT use markdown code fences. Do NOT output a JSON object."
    )

    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": request},
                    {"type": "image_url", "image_url": {"url": data_uri}},
                ],
            },
        ],
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        import httpx

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        return f"Error: vision API request failed: {e}"

    try:
        text = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as e:
        return f"Error: unexpected API response format — missing content: {e}"

    if not text or not text.strip():
        return "Error: vision model returned an empty response."

    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json|markdown)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    parts = re.split(r"\n\s*===FULL===\s*\n", cleaned, maxsplit=1)
    if len(parts) == 2:
        short = parts[0].strip()
        full = parts[1].strip()
    else:
        short = ""
        full = cleaned

    if not short:
        sentences = full.replace("\n", " ").split(". ")
        short = ". ".join(sentences[:2]).strip()
        if short:
            short += "."
        else:
            short = full[:200].rsplit(" ", 1)[0] + "..."

    if not full:
        full = "(empty analysis)"

    work_dir_path = Path(work_dir)
    stem = re.sub(r"\s+", "_", target.stem)
    suffix = uuid.uuid4().hex[:8]
    detail_filename = f"{stem}.{suffix}.md"
    detail_path = work_dir_path / detail_filename

    md_content = f"===REQUEST===\n{request}\n\n===RESULT===\n{full}\n"
    try:
        detail_path.write_text(md_content, encoding="utf-8")
    except Exception as e:
        return f"Error: failed to write detail file '{detail_filename}': {e}"

    return f"{short}\n[DETAIL: {detail_path}]"
