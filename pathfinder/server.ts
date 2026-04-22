import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function listFiles(dir: string, indent = "") {
  if (!fs.existsSync(dir)) {
    console.log(`${indent}${dir} does not exist`);
    return;
  }
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      console.log(`${indent}📁 ${file}/`);
      listFiles(filePath, indent + "  ");
    } else {
      console.log(`${indent}📄 ${file} (${stat.size} bytes)`);
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Simple request logging
  app.use((req, res, next) => {
    if (req.url.startsWith('/api/')) {
      console.log(`[API Request] ${req.method} ${req.url}`);
    }
    next();
  });

  console.log(`[Server] Starting in ${process.env.NODE_ENV || 'development'} mode`);

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { prompt, history } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        console.error("[Server] GEMINI_API_KEY is missing");
        return res.status(500).json({ error: "API Key missing on server" });
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash",
        systemInstruction: "You are a helpful, travel-curator style assistant for the Pathfinder app. Provide concise, editorial, and inspiring responses about travel, hidden gems, and adventures. Use a warm and sophisticated tone."
      });

      let mappedHistory = history.map((msg: any) => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: msg.parts
      }));

      // Gemini API requires the first message in history to be from 'user'.
      // If the history starts with a 'model' message (e.g. the initial greeting),
      // remove it to satisfy the API.
      if (mappedHistory.length > 0 && mappedHistory[0].role === 'model') {
        mappedHistory.shift();
      }

      const chat = model.startChat({
        history: mappedHistory
      });

      const result = await chat.sendMessage(prompt);
      const response = await result.response;
      res.json({ text: response.text() });
    } catch (error) {
      console.error("[Server] Gemini API Error:", error);
      res.status(500).json({ error: "Failed to generate response" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("[Server] Using Vite middleware (development)");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.resolve(__dirname, 'dist');
    console.log(`[Server] Serving static files from: ${distPath}`);
    
    // Serve static assets with long-term caching
    app.use('/assets', express.static(path.join(distPath, 'assets'), {
      immutable: true,
      maxAge: '1y'
    }));

    // Serve other static files (manifest, etc.)
    app.use(express.static(distPath, {
      index: false // Don't serve index.html automatically
    }));
    
    // SPA Fallback: Serve index.html for all other requests
    app.get('*', (req, res) => {
      // If the request looks like a file (has an extension), don't serve index.html
      if (req.url.includes('.') && !req.url.endsWith('.html')) {
        console.log(`[Server] 404 for file: ${req.url}`);
        return res.status(404).send('Not Found');
      }
      
      const indexPath = path.join(distPath, 'index.html');
      console.log(`[Server] Serving index.html for: ${req.url}`);
      
      // CRITICAL: Force index.html to NEVER cache
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      
      res.sendFile(indexPath);
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
