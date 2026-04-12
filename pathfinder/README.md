# 🚀 Pathfinder: AI Itinerary Generator

Pathfinder is a full-stack TypeScript application that leverages the **Google Gemini API** to generate intelligent travel itineraries. It is architectured to run on **Google Cloud Run** with a focus on security and scalability.

## 🛠 Cloud Architecture & "The Fixes"

Deploying this application to a serverless environment required specific architectural adjustments to handle port mapping and TypeScript execution.

### 1. Dynamic Port Mapping
Cloud Run dynamically assigns a port to each container instance. To ensure the application stays reachable, the code must listen on the `$PORT` environment variable rather than a hardcoded value.

* **The Fix:** Update `server.ts` to use `process.env.PORT`.
* **Command:** ```bash
    sed -i 's/const PORT = 3000;/const PORT = process.env.PORT || 8080;/g' server.ts
    ```

### 2. Just-in-Time TypeScript Execution
To avoid the overhead of manual build steps during development, we use `tsx` to execute TypeScript files directly in the Cloud Run environment.

* **The Fix:** Update the `start` script in `package.json` to use `npx tsx`.
* **Command:**
    ```bash
    sed -i 's/"start": "node server.ts"/"start": "npx tsx server.ts"/g' package.json
    ```

---

## 🔐 Security & Secret Management

This project follows the **Principle of Least Privilege** by isolating sensitive credentials from the source code using **Google Secret Manager**.

### Secret Manager Configuration
Instead of using `.env` files which can be accidentally committed to version control, the Gemini API key is stored in Secret Manager.

### IAM Permissions
The Cloud Run Service Account must be granted the `Secret Manager Secret Accessor` role to "unlock" the API key at runtime. Without this, the app will fail to initialize.

**Granting Access Command:**
```bash
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:[PROJECT_NUMBER]-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
