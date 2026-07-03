FROM python:3.11-slim

# Install system utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency definition and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all application files
COPY . .

# Set default environment variables for Vertex AI and Cloud Run
ENV PORT=8080
ENV GOOGLE_GENAI_USE_VERTEXAI="True"
ENV GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
ENV GOOGLE_CLOUD_LOCATION="us-central1"
ENV PYTHONUNBUFFERED=1

EXPOSE 8080

# Launch the FastAPI application server
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
