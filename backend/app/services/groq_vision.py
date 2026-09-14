"""Primary declaration-extraction path: send the label photo to Groq's
vision model and ask it to read the declarations directly, instead of
running PaddleOCR's detect-then-regex-then-spatial-pairing pipeline.

PaddleOCR remains the fallback (see worker.py) for two distinct reasons,
not one:
  1. This call can fail outright (network, rate limit, timeout, bad JSON) —
     in which case worker.py runs the full existing PaddleOCR pipeline for
     that panel exactly as before.
  2. Font-height measurement fundamentally needs bounding-box pixel data
     that a vision LLM does not return — so whenever measure_font_size is
     requested, PaddleOCR still runs regardless of whether Groq succeeds,
     just to get regions for the height calculation, not for text.

Known limitation, observed directly on a real test image: this model can
hallucinate a confident, wrong manufacturer name/address on hard-to-read
print instead of returning null, despite being told not to guess. No
mitigation is applied here yet — deliberately, so real behavior is visible
in the app rather than hidden. Treat the manufacturer field with more
skepticism than the others until that is revisited.
"""

import base64
import json
import logging

import requests

from app.core.config import get_settings

logger = logging.getLogger(__name__)

GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
REQUEST_TIMEOUT_SECONDS = 30
# Groq doesn't return a per-field confidence the way PaddleOCR does per
# region. A fixed, high value reflects that a successful structured read
# from a dedicated vision model is trusted at least as much as PaddleOCR's
# own confidence gate (0.85) for the automatic-decision threshold.
GROQ_FIXED_CONFIDENCE = 0.92

EXTRACTION_PROMPT = """You are reading one panel of a packaged consumer commodity for a Legal Metrology compliance inspection in India. Extract ONLY what is actually printed on the label in the photo. Do not guess or hallucinate a value that is not visibly present — if you cannot clearly read a field, return null for it rather than a plausible-sounding guess.

Return strict JSON with exactly this shape (use null for anything not found):
{
  "product_name": "<common/generic name of the commodity>" or null,
  "mrp": {"value": "<numeric string, no currency symbol>", "currency": "INR", "raw": "<exact text as printed>"} or null,
  "net_quantity": {"value": "<numeric string>", "unit": "<g|kg|ml|l|cm|m|piece|pieces|pair|set>"} or null,
  "manufacture_date": "<as printed>" or null,
  "best_before": "<as printed>" or null,
  "lot_number": "<as printed>" or null,
  "consumer_care": {"phone": "<as printed>" or null, "email": "<as printed>" or null} or null,
  "manufacturer": {"name": "<company name>", "address": "<full address as printed>"} or null,
  "country_of_origin": "<country name>" or null,
  "unit_sale_price": "<as printed, e.g. '22 per g'>" or null,
  "dimensions": "<as printed, if this commodity is sold by dimension>" or null
}

Return ONLY the JSON object, no other text."""


class GroqVisionError(Exception):
    """Raised on any failure — network, HTTP, or malformed response. Callers
    catch this broadly and fall back to PaddleOCR; the specific cause only
    matters for logging."""


class GroqRateLimitError(GroqVisionError):
    """Specifically HTTP 429. worker.py catches this separately to try
    Gemini next, before falling all the way back to PaddleOCR."""


def extract_declarations_via_groq(image_bytes: bytes) -> dict:
    settings = get_settings()
    if not settings.groq_api_key:
        raise GroqVisionError("GROQ_API_KEY is not configured")

    b64 = base64.b64encode(image_bytes).decode()
    payload = {
        "model": settings.groq_vision_model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": EXTRACTION_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                ],
            }
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
    }

    try:
        response = requests.post(
            GROQ_ENDPOINT,
            headers={
                "Authorization": f"Bearer {settings.groq_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        if response.status_code == 429:
            logger.warning("Groq vision rate-limited, trying Gemini next: %s", response.text[:200])
            raise GroqRateLimitError("Groq rate limit exceeded (429)")
        response.raise_for_status()
        body = response.json()
        content = body["choices"][0]["message"]["content"]
        parsed = json.loads(content)
    except GroqRateLimitError:
        raise
    except (requests.RequestException, KeyError, IndexError, json.JSONDecodeError, ValueError) as exc:
        logger.warning("Groq vision extraction failed, falling back to PaddleOCR: %s", exc)
        raise GroqVisionError(str(exc)) from exc

    if not isinstance(parsed, dict):
        raise GroqVisionError(f"Groq returned a non-object JSON value: {type(parsed)!r}")

    return parsed
