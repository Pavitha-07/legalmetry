"""Secondary declaration-extraction path, used only when Groq specifically
rate-limits (HTTP 429) — see groq_vision.py's GroqRateLimitError and
worker.py's fallback chain: Groq -> (on 429 only) Gemini -> PaddleOCR.

Any other Groq failure (network, timeout, malformed response) skips this
and falls straight to PaddleOCR as before; Gemini is reserved specifically
for "Groq is out of quota right now," not as a general backup.

Shares groq_vision.py's EXTRACTION_PROMPT so both models are held to the
same JSON contract and the same "return null, don't guess" instruction —
including the same manufacturer-hallucination caveat noted there.
"""

import base64
import json
import logging

import requests

from app.core.config import get_settings
from app.services.groq_vision import EXTRACTION_PROMPT

logger = logging.getLogger(__name__)

GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
# Verified directly against a real ~4MB evidence photo: Gemini took ~23s to
# respond, vs Groq's ~1-2s for the same kind of request — noticeably slower,
# so this needs real headroom rather than Groq's 30s.
REQUEST_TIMEOUT_SECONDS = 60
# Same reasoning as GROQ_FIXED_CONFIDENCE in groq_vision.py: a successful
# structured read from a dedicated vision model is trusted at least as much
# as PaddleOCR's own confidence gate for the automatic-decision threshold.
GEMINI_FIXED_CONFIDENCE = 0.92


class GeminiVisionError(Exception):
    """Raised on any failure — network, HTTP, or malformed response. The
    caller (worker.py) catches this broadly and falls back to PaddleOCR."""


def extract_declarations_via_gemini(image_bytes: bytes) -> dict:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise GeminiVisionError("GEMINI_API_KEY is not configured")

    b64 = base64.b64encode(image_bytes).decode()
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": EXTRACTION_PROMPT},
                    {"inline_data": {"mime_type": "image/jpeg", "data": b64}},
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "response_mime_type": "application/json",
        },
    }

    try:
        response = requests.post(
            GEMINI_ENDPOINT.format(model=settings.gemini_vision_model),
            params={"key": settings.gemini_api_key},
            headers={"Content-Type": "application/json"},
            json=payload,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        body = response.json()
        content = body["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(content)
    except (requests.RequestException, KeyError, IndexError, json.JSONDecodeError, ValueError) as exc:
        logger.warning("Gemini vision extraction failed, falling back to PaddleOCR: %s", exc)
        raise GeminiVisionError(str(exc)) from exc

    if not isinstance(parsed, dict):
        raise GeminiVisionError(f"Gemini returned a non-object JSON value: {type(parsed)!r}")

    return parsed
