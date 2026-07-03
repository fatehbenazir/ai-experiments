from typing import Literal
from google.adk.agents import Agent
from pydantic import BaseModel, Field

MODEL = "gemini-2.5-flash"

class JudgeFeedback(BaseModel):
    """Structured feedback from the Judge Evaluator agent."""
    status: Literal["pass", "fail"] = Field(
        description="Whether the generated brief meets all criteria ('pass') or fails ('fail')."
    )
    feedback: str = Field(
        description="Detailed feedback on what criteria failed or confirmation of approval."
    )

# --- Generator Agent ---
generator_agent = Agent(
    name="generator_agent",
    model=MODEL,
    description="Synthesizes raw scraped articles into a concise, high-density AI news brief.",
    instruction="""
    You are an expert AI Product Manager synthesizing daily technical news.
    Take the provided 'raw_articles' and 'style_rules' and generate a clean markdown summary.
    
    Rules:
    - Get straight to the point without introductory fluff or analogies.
    - Organize announcements into clean bullet points with bold headers formally hyperlinked to their source URL from 'link' (e.g., '* **[Title](url)** (Date): Summary...').
    - Include publication dates when available.
    - If there are no major product launches, strategic trends, opinion pieces, or architectural design patterns, explicitly output: '* **No major announcements** in this scanning period.'
    """,
)

# --- Judge Evaluator Agent ---
judge_agent = Agent(
    name="judge_agent",
    model=MODEL,
    description="Evaluates generated briefs against strict completion criteria.",
    instruction="""
    You are a strict QA Judge and fact-checker.
    Evaluate the generated 'draft_brief' against the 'raw_articles' and 'spec_rules'.
    
    Checklist:
    1. Is every feed summary under 150 words?
    2. Are there zero hallucinations (every claim is directly present in 'raw_articles')?
    3. Is all meta-commentary stripped?
    4. Are announcement headers formatted as clickable markdown links (e.g., '* **[Title](url)**') whenever a URL is present in 'raw_articles'?
    
    If all checks pass, output status='pass'.
    If any check fails, output status='fail' with actionable feedback.
    """,
    output_schema=JudgeFeedback,
)
