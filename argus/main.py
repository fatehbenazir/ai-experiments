import os
import json
import asyncio
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List

# Configure Vertex AI according to project rules
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "True")
project_id = os.environ.get("GOOGLE_CLOUD_PROJECT", "your-gcp-project-id")
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", project_id)
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "us-central1")

import scraper_tools
from agent import generator_agent, judge_agent, JudgeFeedback
from google import genai
from google.genai import types

def load_file_str(filepath: Path) -> str:
    if filepath.exists():
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read()
    return ""

def load_json(filepath: Path, default: Any) -> Any:
    if filepath.exists():
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[Harness] Warning: Failed to load JSON from {filepath}: {e}")
    return default

def save_json(filepath: Path, data: Any):
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

def run_agent_sync(agent, user_prompt: str, is_json_schema: bool = False) -> str:
    """Executes an ADK Agent using the underlying GenAI client with its configured instruction and schema."""
    curr_project = os.environ.get("GOOGLE_CLOUD_PROJECT", "your-gcp-project-id")
    client = genai.Client(vertexai=True, project=curr_project, location="us-central1")
    
    config_args = {}
    if hasattr(agent, "instruction") and agent.instruction:
        config_args["system_instruction"] = agent.instruction
    if hasattr(agent, "output_schema") and agent.output_schema:
        config_args["response_schema"] = agent.output_schema
        config_args["response_mime_type"] = "application/json"
    elif is_json_schema:
        config_args["response_mime_type"] = "application/json"

    model_name = getattr(agent, "model", "gemini-2.5-flash")
    if not isinstance(model_name, str):
        model_name = "gemini-2.5-flash"

    try:
        response = client.models.generate_content(
            model=model_name,
            contents=[user_prompt],
            config=types.GenerateContentConfig(**config_args) if config_args else None
        )
        return response.text
    except Exception as e:
        print(f"[Harness] Error invoking agent {agent.name}: {e}")
        return ""

def send_chat_brief(brief_path: Path):
    """Sends the generated markdown brief to Google Chat via Webhook URL."""
    webhook_url = os.environ.get("GOOGLE_CHAT_WEBHOOK_URL")
    if not webhook_url:
        print("[Chat] Warning: GOOGLE_CHAT_WEBHOOK_URL environment variable not set. Skipping chat dispatch.")
        return

    try:
        content = ""
        with open(brief_path, "r", encoding="utf-8") as f:
            content = f.read()

        print("[Chat] Dispatching daily brief to Google Chat Webhook...")
        import requests

        # Split content by major sections (---) to respect Google Chat's 4,096 character limit per message
        sections = content.split("\n---\n")
        for idx, section in enumerate(sections):
            clean_section = section.strip()
            if not clean_section:
                continue

            payload = {"text": clean_section}
            response = requests.post(webhook_url, json=payload, timeout=15)
            if response.status_code == 200:
                print(f"[Chat] Successfully posted section {idx+1}/{len(sections)} to Google Chat.")
            else:
                print(f"[Chat] Error posting section {idx+1}: HTTP {response.status_code} - {response.text}")
    except Exception as e:
        print(f"[Chat] Failed to dispatch brief to Google Chat: {e}")

def save_to_gcs(brief_path: Path, today_str: str):
    """Uploads the markdown brief and a rendered HTML dashboard to Google Cloud Storage."""
    bucket_name = os.environ.get("GCS_BUCKET_NAME", f"{os.environ.get('GOOGLE_CLOUD_PROJECT', 'your-gcp-project-id')}-argus-briefs")
    try:
        from google.cloud import storage
        client = storage.Client()
        bucket = client.bucket(bucket_name)

        # Upload markdown backup
        md_blob = bucket.blob(f"archive/daily_brief_{today_str}.md")
        md_blob.upload_from_filename(str(brief_path))

        # Convert Markdown to clean HTML dashboard
        with open(brief_path, "r", encoding="utf-8") as f:
            content = f.read()

        import re
        html = content
        html = re.sub(r"^# (.*?)$", r"<h1>\1</h1>", html, flags=re.MULTILINE)
        html = re.sub(r"^## (.*?)$", r"<h2>\1</h2>", html, flags=re.MULTILINE)
        html = re.sub(r"^### (.*?)$", r"<h3>\1</h3>", html, flags=re.MULTILINE)
        html = re.sub(r"^\*\s+\*\*\[(.*?)\]\((.*?)\)\*\*(.*?)$", r'<li><strong><a href="\2" target="_blank">\1</a></strong>\3</li>', html, flags=re.MULTILINE)
        html = re.sub(r"^\*\s+(.*?)$", r"<li>\1</li>", html, flags=re.MULTILINE)
        
        dashboard_html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Argus Intelligence Dashboard ({today_str})</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; line-height: 1.6; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #1f2937; background: #fdfdfd; }}
        h1 {{ border-bottom: 2px solid #2563eb; padding-bottom: 10px; color: #111827; }}
        h2 {{ margin-top: 30px; color: #1e3a8a; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }}
        a {{ color: #2563eb; text-decoration: none; }}
        a:hover {{ text-decoration: underline; }}
        li {{ margin-bottom: 8px; }}
        .footer {{ margin-top: 50px; font-size: 0.85em; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 15px; }}
    </style>
</head>
<body>
    {html}
    <div class="footer">
        <strong>Argus Autonomous Intelligence Platform (ADK V1)</strong><br>
        Generated serverless on Google Cloud Run &bull; Fact-Checked by QA Judge Evaluator &bull; {datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC")}
    </div>
</body>
</html>"""

        # Upload latest.html (the permanent web bookmark!)
        latest_blob = bucket.blob("latest.html")
        latest_blob.upload_from_string(dashboard_html, content_type="text/html; charset=utf-8")

        # Upload daily archive copy
        archive_html_blob = bucket.blob(f"archive/{today_str}.html")
        archive_html_blob.upload_from_string(dashboard_html, content_type="text/html; charset=utf-8")

        print(f"[GCS] Successfully uploaded intelligence dashboard to gs://{bucket_name}/latest.html")
    except Exception as e:
        print(f"[GCS] Failed to upload brief to Google Cloud Storage: {e}")

def main(force: bool = False):
    print(f"=== Starting Argus Intelligence Scan (ADK V1) | Force Fresh: {force} ===")
    base_dir = Path(__file__).parent
    
    # 1. Load configuration and state
    targets = load_json(base_dir / "targets.json", [])
    checkpoint = load_json(base_dir / "checkpoint.json", {})
    spec_rules = load_file_str(base_dir / "spec.md")
    style_rules = load_file_str(base_dir / "AGENTS.md")
    
    today_str = datetime.now().strftime("%Y-%m-%d")
    timestamp_str = datetime.now().strftime("%Y%m%d")
    brief_filename = base_dir / f"daily_brief_{timestamp_str}.md"
    
    if today_str not in checkpoint:
        checkpoint[today_str] = {}

    daily_brief_sections = []

    # 2. Process each target in the plan
    for target in targets:
        name = target.get("name", "Unknown Target")
        url = target.get("url", "")
        
        # Checkpoint check: skip already completed feeds unless force=True
        if not force and checkpoint[today_str].get(url) == "DONE":
            print(f"[Harness] Skipping {name} ({url}) - Already processed today.")
            continue
            
        print(f"\n--- Processing Target: {name} ---")
        articles = scraper_tools.scrape_target(target, max_items=4)
        if not articles:
            print(f"[Harness] No articles found for {name}.")
            checkpoint[today_str][url] = "DONE"
            save_json(base_dir / "checkpoint.json", checkpoint)
            continue
            
        # Save raw scrape
        raw_path = scraper_tools.save_raw_scrape(name, articles, base_dir)
        print(f"[Harness] Raw scrape saved to {raw_path.name}")
        
        raw_text_payload = json.dumps(articles, indent=2)
        
        # Step 1: Generator Agent
        print(f"[Harness] Invoking Generator Agent for {name}...")
        gen_prompt = f"TARGET: {name}\nRAW DATA: {raw_text_payload}\n\nSPEC RULES:\n{spec_rules}\n\nSTYLE RULES:\n{style_rules}\n\nGenerate the news brief section for this target:"
        draft_brief = run_agent_sync(generator_agent, gen_prompt)
        
        # Step 2: Judge Evaluator Agent
        print(f"[Harness] Invoking Judge Evaluator Agent for {name}...")
        judge_prompt = f"TARGET: {name}\nRAW DATA:\n{raw_text_payload}\n\nDRAFT BRIEF:\n{draft_brief}\n\nSPEC RULES:\n{spec_rules}\n\nEvaluate if the draft follows all rules:"
        judge_raw = run_agent_sync(judge_agent, judge_prompt)
        
        status = "pass"
        feedback = "All checks passed."
        try:
            cleaned_json = judge_raw.strip()
            if cleaned_json.startswith("```json"):
                cleaned_json = cleaned_json.split("```json")[1].split("```")[0].strip()
            elif cleaned_json.startswith("```"):
                cleaned_json = cleaned_json.split("```")[1].split("```")[0].strip()
            parsed = json.loads(cleaned_json)
            status = parsed.get("status", "pass").lower()
            feedback = parsed.get("feedback", feedback)
        except Exception as e:
            print(f"[Harness] Warning: Failed to parse judge output: {e}. Defaulting to pass.")

        print(f"[Judge Result] Status: {status.upper()} | Feedback: {feedback}")
        
        # Retry loop if failed
        if status == "fail":
            print(f"[Harness] Judge rejected draft. Requesting Generator correction...")
            retry_prompt = f"{gen_prompt}\n\nPREVIOUS DRAFT:\n{draft_brief}\n\nJUDGE REJECTION FEEDBACK:\n{feedback}\n\nPlease revise the draft to fix all issues reported by the Judge:"
            draft_brief = run_agent_sync(generator_agent, retry_prompt)
            print(f"[Harness] Revision generated.")
            
        daily_brief_sections.append(f"## {name}\n\n{draft_brief.strip()}\n")
        
        # Update checkpoint
        checkpoint[today_str][url] = "DONE"
        save_json(base_dir / "checkpoint.json", checkpoint)
        print(f"[Harness] Successfully completed {name} and updated checkpoint.")

    # 3. Assemble and save the daily brief artifact
    if daily_brief_sections:
        full_brief = f"# Argus Daily Intelligence Brief ({today_str})\n\n" + "\n---\n\n".join(daily_brief_sections)
        with open(brief_filename, "w", encoding="utf-8") as f:
            f.write(full_brief)
        print(f"\n=== Argus Daily Brief successfully generated: {brief_filename} ===")
        send_chat_brief(brief_filename)
        save_to_gcs(brief_filename, today_str)
        return {"status": "success", "brief_path": str(brief_filename), "sections_count": len(daily_brief_sections)}
    else:
        print("\n=== No new sections generated for today's brief. ===")
        return {"status": "no_new_sections", "brief_path": str(brief_filename), "sections_count": 0}

if __name__ == "__main__":
    main()
