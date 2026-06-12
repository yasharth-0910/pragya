"""Pydantic schemas for the meeting assistant endpoint."""

from typing import Literal

from pydantic import BaseModel, Field


class MeetingActionItem(BaseModel):
    text: str
    owner: str | None = None
    deadline: str | None = None
    priority: Literal["high", "medium", "low"] = "medium"


class MeetingRequest(BaseModel):
    transcript: str = Field(..., min_length=50, max_length=50_000)
    title: str | None = Field(default=None, max_length=200)


class MeetingResponse(BaseModel):
    summary: str
    decisions: list[str]
    action_items: list[MeetingActionItem]
    participants: list[str]
    duration_estimate: str | None = None
    follow_up_questions: list[str]
