import os
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
import main

app = FastAPI(
    title="Argus Intelligence Service",
    description="Serverless Cloud Run wrapper for Argus, the 15-feed ADK AI Intelligence Tracker.",
    version="1.0.0"
)

class ScanResponse(BaseModel):
    status: str
    brief_path: str
    sections_count: int

@app.get("/")
def health_check():
    """Health check endpoint for Cloud Run and load balancers."""
    return {
        "status": "ok",
        "service": "argus",
        "project": os.environ.get("GOOGLE_CLOUD_PROJECT", "your-gcp-project-id"),
        "location": os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
    }

@app.post("/scan", response_model=ScanResponse)
def trigger_scan_sync(force: bool = False):
    """Synchronous scan endpoint invoked by Cloud Scheduler. Runs the 15-feed scan and returns results."""
    try:
        result = main.main(force=force)
        if not result:
            result = {"status": "unknown", "brief_path": "", "sections_count": 0}
        return ScanResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scan execution failed: {str(e)}")

@app.post("/rescan", response_model=ScanResponse)
def trigger_rescan_sync():
    """Dedicated endpoint to force a fresh rescan of all feeds for today, bypassing the checkpoint."""
    return trigger_scan_sync(force=True)

@app.post("/scan-async")
def trigger_scan_async(background_tasks: BackgroundTasks, force: bool = False):
    """Asynchronous scan endpoint. Triggers scan in background and returns immediately."""
    background_tasks.add_task(main.main, force=force)
    return {"status": "accepted", "message": f"Scan triggered in background (force={force})."}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("server:app", host="0.0.0.0", port=port)
