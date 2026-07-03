# Argus: Autonomous AI Intelligence Tracker (ADK V1)

> **Enterprise Serverless Architecture**: Built on Google GenAI SDK, Google Agent Development Kit (ADK), and Google Cloud Run.

An autonomous, serverless AI intelligence gathering system built on the Google GenAI SDK and Google's Agent Development Kit (ADK) architecture. Argus monitors 15 industry-leading AI research, product, and thought leadership feeds, synthesizes high-density briefs, enforces zero-hallucination quality control via a self-healing dual-agent loop, and dispatches updates to Google Chat.

---

## 1. System Architecture

The tracker implements a supervisor-evaluator design pattern using two specialized AI agents running on Vertex AI (`gemini-2.5-flash`):

```
[RSS / HTML Feeds] ---> [Scraper Tools] ---> [Generator Agent] ---> [Draft Brief]
                                                                        |
[Google Chat Webhook] <--- [Daily Artifact] <--- (Pass) <--- [Judge Evaluator QA] <---+
                                                                        |             |
                                                                   (Fail / Reject)    |
                                                                        +-------------+
```

### Core Components
* **Generator Agent (`agent.py`)**: Ingests raw scraped XML/HTML payloads and synthesizes concise, authoritative summaries (<150 words). Enforces formal Markdown hyperlink formatting where every announcement title is linked directly to its source URL.
* **Judge Evaluator Agent (`agent.py` & `spec.md`)**: Acts as an automated quality control gatekeeper. Evaluates drafts against rigorous zero-hallucination rules, word limits, and style guidelines. If a draft contains inferences, meta-commentary, or broken links, the Judge rejects the output and triggers an automated revision loop.
* **Idempotency Harness (`main.py` & `checkpoint.json`)**: Tracks processed URLs by date. If a feed has already been processed on a given day, it is skipped unless a forced rescan is requested.
* **Chunked Webhook Dispatcher (`main.py`)**: Splits the assembled Markdown brief by section (`---`) and dispatches sequential payloads to Google Chat via an incoming webhook, preventing message truncation from chat character limits.

### Why Serverless Over Long-Running Daemon Agents?
While traditional "long-running agents" execute as continuous background processes (`while True` daemon loops), this system implements an **Autonomous Serverless Agentic Workflow**.

| Architectural Dimension | Traditional Daemon Agent (`while True`) | Serverless Agent Workflow (Our Architecture) |
| :--- | :--- | :--- |
| **Compute & Cost Efficiency** | Consumes 24/7 idle memory and compute billing while waiting for scheduled execution triggers. | **Zero Idle Cost.** Container scales to zero between runs and only bills during active synthesis (~3–5 minutes daily). |
| **State Continuity** | Relies on fragile in-memory RAM state that is lost during container crashes or reboots. | **Persistent External Memory.** Uses `checkpoint.json` to maintain cross-session idempotency across independent container invocations. |
| **Fault Isolation** | A memory leak or unhandled exception in one cycle can crash the permanent daemon. | **Total Isolation.** Each morning scan executes in a clean, ephemeral container instance with automated retry policies. |

---

## 2. Target Feeds (`targets.json`)

The system tracks 15 curated research and engineering sources across four quadrants:
1. **AI Labs & Research**: Google DeepMind, Google AI (The Keyword), Google Cloud AI, Anthropic, OpenAI, NVIDIA.
2. **AI Engineering & Tools**: Cursor, Addy Osmani's Blog, Stanford HAI.
3. **Strategic AI Insights**: Sequoia Capital, Andreessen Horowitz (a16z AI), SemiAnalysis.
4. **Enterprise & Industry Strategy**: McKinsey Insights, Bain & Company Insights, SpaceX.

---

## 3. Local Development & Execution

### Prerequisites
* Python 3.11+
* Google Cloud SDK (`gcloud`) with active Application Default Credentials (ADC) or Vertex AI access.

### Installation
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Running a Scan
To run the daily scan with checkpointing enabled:
```bash
export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
export GOOGLE_CHAT_WEBHOOK_URL="https://chat.googleapis.com/v1/spaces/YOUR_SPACE/messages?key=...&token=..."
python3 main.py
```

To force a fresh re-scan of all 15 feeds (bypassing today's checkpoint):
```bash
python3 main.py --force
```

---

## 4. Serverless Cloud Run Deployment

The project includes a lightweight FastAPI service (`server.py`) designed for serverless container deployment on Google Cloud Run, automated via Google Cloud Scheduler.

### API Endpoints
* `GET /`: Health check endpoint returning runtime service and project metadata.
* `POST /scan`: Standard idempotent daily scan trigger.
* `POST /rescan`: Dedicated endpoint that invokes `main(force=True)` for on-demand intelligence refreshes.

### Container Deployment Sequence
```bash
# 1. Build and submit container image
gcloud builds submit --tag gcr.io/your-gcp-project-id/argus:latest --project=your-gcp-project-id

# 2. Deploy to Google Cloud Run
gcloud run deploy argus \
  --image=gcr.io/your-gcp-project-id/argus:latest \
  --region=us-central1 \
  --project=your-gcp-project-id \
  --service-account=argus-sa@your-gcp-project-id.iam.gserviceaccount.com \
  --set-env-vars="GOOGLE_CHAT_WEBHOOK_URL=https://chat.googleapis.com/..." \
  --no-allow-unauthenticated \
  --memory=2Gi \
  --timeout=15m
```

### Automation via Cloud Scheduler
Configure a daily cron schedule (`0 6 * * *` for 06:00 AM UTC) targeting `POST https://[YOUR-SERVICE-URL]/scan` with OIDC authentication bound to the runtime service account.

---

## 5. Security & Privacy Hygiene

* **Zero Hardcoded Secrets**: All project identifiers, API keys, and webhook URLs are injected dynamically via environment variables (`os.environ`).
* **Repository Defense**: `.gitignore` and `.dockerignore` exclude virtual environments (`.venv/`), local environment secrets (`.env`), raw scraped JSON payloads (`scrapes/`), and local markdown briefs (`daily_brief_*.md`).
