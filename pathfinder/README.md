# Pathfinder: Edge AI Travel Curator 🚀

Pathfinder is an experimental prototyping app that implements on-device local Large Language Model (LLM) inference serving directly inside the user's browser using **Gemma 4**. 

By leveraging modern browser APIs, the application allows users to download and execute model inference locally, removing cloud serving latency and reducing operating infrastructure costs.

---

## 🛠️ Key Architecture Decisions

- **The edge serving**: The 2.4GB model weights are hosted in a Google Cloud Storage (GCS) bucket and downloaded to the client using range requests.
- **Storage strategy**: Instead of taking up memory or relying on large cloud serving infrastructure, the model lives inside the user’s **Browser Cache API Storage** for quick local loading.
- **Inference Runtime**: Powered by **MediaPipe Tasks GenAI** (`LlmInference`). 
- **The Compute Bridge**: Uses **WebGPU** to execute the model on the local device's graphics hardware directly inside the browser tab.
- **Instruction Priming (Multilingual steering)**: Small models can drift when provided with very short prompts. We prime the conversation array by injecting a fake starting turn to force the model into strict English travel-curator guardrails without needing traditional backend System Instructions.

---

## 🌐 GCS Bucket CORS Configuration

To allow the browser application to fetch the large model chunks, your storage bucket must have a specific CORS configuration applied. 

Here is an example of the ruleset you apply to your GCS bucket (remember to swap in your local URLs or staging URLs):

```json
[
  {
    "origin": [
      "https://YOUR_STAGING_APP_URL.run.app",
      "http://localhost:3001"
    ],
    "method": ["GET"],
    "responseHeader": ["Content-Type", "Content-Length", "Range"],
    "maxAgeSeconds": 3600
  }
]
```

To apply this configuration to your bucket:
```bash
gcloud storage buckets update gs://YOUR_GCS_BUCKET_NAME --cors-file=cors.json
```

---

## 🔧 Prerequisites

To run edge AI inference locally, your browser environment needs to be prepared:

### 🌐 WebGPU & Browser Setup
1.  **Enable WebGPU in Chrome**:
    *   Type `chrome://flags` in a browser tab.
    *   Search for **WebGPU**.
    *   Ensure that **Unsafe WebGPU** (or related experimental WebGPU options) are enabled.
2.  **Enable Hardware Acceleration**:
    *   Navigate to Chrome **Settings** > **System**.
    *   Enable: **"Use graphics acceleration when available"**.
    *   Restart Chrome entirely after applying these changes.

### 📦 Model Format
- The MediaPipe Tasks GenAI framework expects models packaged in the **`.task`** package format. Supply a valid `.task` model file rather than raw model weights to test the edge pipeline!

---

## 🚀 Local Development Setup

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Configure Environment Variables:
    Create or update your local `.env` file:
    ```env
    VITE_GCS_MODELS_URL=https://storage.googleapis.com/YOUR_GCS_BUCKET/models
    GEMINI_API_KEY=YOUR_GEMINI_API_KEY
    PORT=3001
    ```

3.  Execute the Local Server:
    ```bash
    npm run dev
    ```

Access the app locally at `http://localhost:3001`. 

*Note: The `GEMINI_API_KEY` is used for online backup/fallback workflows. Offline Gemma inference logic runs entirely on-device provided the prerequisites above are met.*
