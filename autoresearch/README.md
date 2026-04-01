# Autoresearch on Google Cloud

This folder contains a serverless deployment of the autonomous LLM "autoresearch" loop originally designed by Karpathy. Here, an LLM agent creates, tests, and optimizes its own ML models and hyperparameters on remote serverless resources.

## What we've done so far (Baseline)
- **Repo Migrations**: Shifted serverless files from original Karpathy experimental branches directly into the `autoresearch` subdirectory of this central `ai-experiments` repository.
- **Serverless Automation**: Mapped the research training loop to run on **Cloud Run Jobs** and orchestrated loops with designated study limits using **Cloud Workflows**.
- **Compute Profiles & Quota**: Avoided capacity limits on `us-central1` by targeting `us-east4` L4 GPU nodes natively.
- **Security Check**: Stripped out hardcoded credentials. Keys are read dynamically directly from Secret Manager at container runtime.
- **Results & Data Storage**: Results from baseline studies are successfully tracked into the custom `results.tsv` file and backed up directly to standard GCS persistent paths (`gs://bf-autoresearch/results/`).

## How to Run the 110M Baseline
To launch the 1-hour study loop to optimize the baseline 110M GPT model:
```bash
gcloud workflows execute autoresearch-study \
  --location=us-east4 \
  --data='{"hours": 1, "study_name": "original-autoresearch", "job_timeout": 3600}'
```

## Active Development: Gemma 3
We are currently on the `feature/gemma3` branch targeting loading state from `google/gemma-3-1b-it` on Hugging Face instead of processing the short 110M custom small model.
- See `train_gemma3.py` for training structures loading active HF tokens.
- We reduced the `DEVICE_BATCH_SIZE` to 1 to fit gradient accumulations on L4 instances.
