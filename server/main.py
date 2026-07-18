"""Minimal Gemini-backed extraction API for Schedger."""

import json
import os
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).with_name(".env"))

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    raise RuntimeError("GEMINI_API_KEY is required. Set it in server/.env before starting the extraction API.")

# Instantiate once, rather than creating a client for every extraction request.
MODEL_NAME = "gemini-3.1-flash-lite"
client = genai.Client(api_key=API_KEY)


class ExtractRequest(BaseModel):
    text: str = Field(min_length=1, max_length=200_000)


class ExtractedEvent(BaseModel):
    title: str
    location: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    confidence: Literal["high", "low"] = "low"


SYSTEM_INSTRUCTION = """
You extract calendar events from PDF text. Return only genuinely calendar-relevant events.
Never invent a date, time, title, location, or duration. If an event has no real date in
the source, omit it instead of using today's date or guessing. Prefer explicitly labelled
Start date, End date, Event date, and table-column labels over incidental letter
issuance/header dates.

Group a clearly related start/end pair, such as an internship period, into one event with
start_date and end_date. For multiple fee-tiered deadlines for one action, return one event
using the earliest actionable (lowest-fee) deadline; do not create one event per fee tier.
Synthesize a concise, meaningful title from the document subject or context. Use ISO 8601
calendar dates (YYYY-MM-DD) where a date is confirmed. Return an empty list if there are no
confirmed calendar events.
""".strip()

app = FastAPI(title="Schedger Extraction API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def parsed_events(response: object) -> list[dict]:
    """Use the SDK parsed value when available, with a JSON fallback."""
    parsed = getattr(response, "parsed", None)
    if parsed is not None:
        return [item.model_dump() if isinstance(item, BaseModel) else item for item in parsed]

    data = json.loads(getattr(response, "text", None) or "[]")
    if not isinstance(data, list):
        raise ValueError("Gemini structured output was not an event array")
    return data


@app.post("/api/extract", response_model=list[ExtractedEvent])
def extract(request: ExtractRequest) -> list[dict]:
    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=request.text,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                response_schema=list[ExtractedEvent],
            ),
        )
        return parsed_events(response)
    except Exception as error:
        # Keep provider stack traces off the browser while keeping failures clear.
        raise HTTPException(status_code=502, detail=f"Gemini extraction failed: {error}") from error
