import { LlmInference, FilesetResolver } from "@mediapipe/tasks-genai";

export type AIModelType = 'gemini' | 'gemma';
export type GemmaStatus = 'not_downloaded' | 'downloading' | 'downloaded' | 'error';

export interface AIResponse {
  text: string;
  modelUsed: AIModelType;
  isOffline: boolean;
}

class AIService {
  private gemmaInference: LlmInference | null = null;
  private isDownloading = false;

  constructor() {}

  async isWebGPUSupported(): Promise<boolean> {
    return !!(navigator as any).gpu;
  }

  async isGemmaDownloaded(): Promise<boolean> {
    return localStorage.getItem(`gemma_2b_downloaded`) === 'true';
  }

  async downloadGemma(onProgress?: (progress: number) => void): Promise<void> {
    if (this.isDownloading) return;
    this.isDownloading = true;

    try {
      // 1. Check storage quota ... (keep this part)
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const availableMB = estimate.quota ? Math.round((estimate.quota - (estimate.usage || 0)) / (1024 * 1024)) : 0;
        const requiredMB = 1700; // 2B model is ~1.7GB
        if (availableMB > 0 && availableMB < requiredMB) {
          throw new Error(`Insufficient storage. You need at least ${requiredMB}MB free, but only ${availableMB}MB is available.`);
        }
      }

      // 2. Manual fetch with Range requests and resumption
      const gcsBaseUrl = import.meta.env.VITE_GCS_MODELS_URL || "https://storage.googleapis.com/bfpersonal/models";
      const modelFileName = "gemma-4-E2B-it-web.task";
      const modelUrl = `${gcsBaseUrl}/${modelFileName}`;

      console.log(`Starting chunked download of Gemma 4 2B from ${modelUrl}...`);
      
      // Get content length via Range request (bytes=0-0) instead of HEAD to avoid CORS issues
      const lengthResponse = await fetch(modelUrl, { headers: { 'Range': 'bytes=0-0' } });
      if (!lengthResponse.ok && lengthResponse.status !== 206) {
        throw new Error(`Length check failed: Status ${lengthResponse.status} (${lengthResponse.statusText})`);
      }
      
      const contentRange = lengthResponse.headers.get('content-range');
      let total = 0;
      
      if (contentRange) {
        total = parseInt(contentRange.split('/')[1], 10);
      } else if (lengthResponse.status === 200) {
        // If server ignored Range and returned full file, use content-length
        total = parseInt(lengthResponse.headers.get('content-length') || '0', 10);
      }
      
      // CORS Fallback: If browser blocks access to Content-Length, use hardcoded size
      if (!total) {
        console.warn("Could not determine file size from headers (likely CORS block). Using hardcoded fallback.");
        total = 2003697664; // Exact size of gemma-4-E2B-it-web.task
      }

      const chunkSize = 50 * 1024 * 1024; // 50MB chunks
      const cache = await caches.open('gemma-models-cache');
      
      // Check last successful chunk from localStorage
      const lastChunkIndex = parseInt(localStorage.getItem('gemma_last_chunk') || '-1', 10);
      let loaded = (lastChunkIndex + 1) * chunkSize;
      if (loaded > total) loaded = total;

      console.log(`Resuming from chunk ${lastChunkIndex + 1}, already loaded: ${loaded} bytes.`);

      for (let start = (lastChunkIndex + 1) * chunkSize; start < total; start += chunkSize) {
        const end = Math.min(start + chunkSize - 1, total - 1);
        const chunkIndex = Math.floor(start / chunkSize);
        console.log(`Fetching chunk ${chunkIndex} (range bytes=${start}-${end})...`);
        
        const response = await fetch(modelUrl, {
          headers: { 'Range': `bytes=${start}-${end}` }
        });
        
        if (!response.ok && response.status !== 206) {
          throw new Error(`Chunk ${chunkIndex} fetch failed: Status ${response.status} (${response.statusText})`);
        }
        
        // Store chunk in cache immediately using clone
        const chunkUrl = `${modelUrl}?chunk=${chunkIndex}`;
        // Convert 206 response to 200 to satisfy Cache API
        const clonedResponse = response.clone();
        const responseToCache = new Response(clonedResponse.body, {
          status: 200,
          statusText: 'OK',
          headers: clonedResponse.headers
        });
        await cache.put(chunkUrl, responseToCache);
        
        // Read to track progress
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Chunk response body is null");

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          loaded += value.length;
          if (onProgress) {
            onProgress(Math.round((loaded / total) * 100));
          }
        }

        // Save progress after successful chunk storage
        localStorage.setItem('gemma_last_chunk', String(chunkIndex));
      }

      // Finalization: Combine chunks into a single cache entry
      console.log("All chunks downloaded. Combining into final cache entry...");
      
      const totalChunks = Math.ceil(total / chunkSize);
      
      const combinedStream = new ReadableStream({
        async start(controller) {
          for (let i = 0; i < totalChunks; i++) {
            const chunkUrl = `${modelUrl}?chunk=${i}`;
            const cachedChunk = await cache.match(chunkUrl);
            if (!cachedChunk) throw new Error(`Missing chunk ${i} in cache`);
            
            const reader = cachedChunk.body?.getReader();
            if (!reader) throw new Error(`Chunk ${i} body is null`);
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          }
          controller.close();
        }
      });

      // Prepare headers for the combined response
      const headers = new Headers(lengthResponse.headers);
      headers.delete('content-range');
      headers.set('content-length', String(total));

      const progressResponse = new Response(combinedStream, { headers });
      
      await cache.put(modelUrl, progressResponse);
      console.log(`Gemma 4 2B successfully cached.`);

      // Clean up chunks
      for (let i = 0; i < totalChunks; i++) {
        await cache.delete(`${modelUrl}?chunk=${i}`);
      }
      
      localStorage.removeItem('gemma_last_chunk');
      localStorage.setItem(`gemma_2b_downloaded`, 'true');
      this.isDownloading = false;
    } catch (error) {
      this.isDownloading = false;
      console.error(`Gemma download failed:`, error);
      throw error;
    }
  }

  async generateResponse(
    prompt: string, 
    history: { role: string; parts: { text: string }[] }[],
    preferOffline = false
  ): Promise<AIResponse> {
    const isOnline = navigator.onLine;
    const downloaded = await this.isGemmaDownloaded();
    const webGPU = await this.isWebGPUSupported();
    const canUseGemma = downloaded && webGPU && (preferOffline || !isOnline);

    if (!isOnline || (preferOffline && canUseGemma)) {
      if (canUseGemma) {
        try {
          if (!this.gemmaInference) {
            const genaiFileset = await FilesetResolver.forGenAiTasks(
              "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm"
            );
            
            const gcsBaseUrl = import.meta.env.VITE_GCS_MODELS_URL || "https://storage.googleapis.com/bfpersonal/models";
            const modelFileName = "gemma-4-E2B-it-web.task";
            const modelUrl = `${gcsBaseUrl}/${modelFileName}`;

            // Check cache first
            const cache = await caches.open('gemma-models-cache');
            const cachedResponse = await cache.match(modelUrl);
            
            let modelAssetPath: string;
            if (cachedResponse) {
              console.log("Loading Gemma from cache...");
              const blob = await cachedResponse.blob();
              modelAssetPath = URL.createObjectURL(blob);
            } else {
              console.log("Gemma not in cache, using direct URL...");
              modelAssetPath = modelUrl;
            }

            this.gemmaInference = await LlmInference.createFromOptions(genaiFileset, {
              baseOptions: { modelAssetPath },
              maxTokens: 1024,
              temperature: 0.7,
            });
          }
          
          const formattedPrompt = this.formatHistory(history, prompt);
          const result = await this.gemmaInference!.generateResponse(formattedPrompt);
          
          // Truncate if model leaks control tokens
          const cleanText = result.split('<end_of_turn>')[0].trim();
          
          return {
            text: cleanText,
            modelUsed: 'gemma',
            isOffline: !isOnline
          };
        } catch (error) {
          console.error("Gemma inference failed:", error);
          if (isOnline) return this.callGemini(history, prompt);
          throw new Error("Offline and Gemma failed.");
        }
      } else if (!isOnline) {
        throw new Error("Offline and Gemma not available.");
      }
    }

    return this.callGemini(history, prompt);
  }

  private formatHistory(history: { role: string; parts: { text: string }[] }[], currentPrompt: string): string {
    // Prime the model with system instructions in a fake turn
    let context = "<start_of_turn>user\nYou are a helpful, travel-curator style assistant for the Pathfinder app. Provide concise, editorial, and inspiring responses about travel, hidden gems, and adventures. Use a warm and sophisticated tone. ALWAYS RESPOND IN ENGLISH.<end_of_turn>\n";
    context += "<start_of_turn>model\nUnderstood. I will provide inspiring travel recommendations in English.<end_of_turn>\n";
    
    history.slice(-3).forEach(msg => {
      const role = msg.role === 'model' ? 'model' : 'user';
      context += `<start_of_turn>${role}\n${msg.parts[0].text}<end_of_turn>\n`;
    });
    context += `<start_of_turn>user\n${currentPrompt}<end_of_turn>\n<start_of_turn>model\n`;
    return context;
  }

  private async callGemini(history: { role: string; parts: { text: string }[] }[], prompt: string): Promise<AIResponse> {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, history })
      });

      if (!response.ok) throw new Error('Failed to fetch from Gemini API');
      
      const data = await response.json();

      return {
        text: data.text || "I'm sorry, I couldn't generate a response.",
        modelUsed: 'gemini',
        isOffline: false
      };
    } catch (error) {
      console.error("Gemini call failed:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();
