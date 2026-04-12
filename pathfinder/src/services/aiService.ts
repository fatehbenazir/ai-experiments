import { LlmInference, FilesetResolver } from "@mediapipe/tasks-genai";

export type AIModelType = 'gemini' | 'gemma';
export type GemmaStatus = 'not_downloaded' | 'downloading' | 'downloaded' | 'error';
export type GemmaModelSize = '2b' | '9b';

export interface AIResponse {
  text: string;
  modelUsed: AIModelType;
  isOffline: boolean;
}

class AIService {
  private gemmaInference: LlmInference | null = null;
  private isDownloading = false;
  private currentModelSize: GemmaModelSize = '2b';

  constructor() {}

  async isWebGPUSupported(): Promise<boolean> {
    return !!(navigator as any).gpu;
  }

  async isGemmaDownloaded(size: GemmaModelSize = '2b'): Promise<boolean> {
    return localStorage.getItem(`gemma_${size}_downloaded`) === 'true';
  }

  async downloadGemma(size: GemmaModelSize = '2b', onProgress?: (progress: number) => void): Promise<void> {
    if (this.isDownloading) return;
    this.isDownloading = true;
    this.currentModelSize = size;

    try {
      // Check storage quota before starting
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const availableMB = estimate.quota ? Math.round((estimate.quota - (estimate.usage || 0)) / (1024 * 1024)) : 0;
        console.log(`Storage estimate: ${availableMB}MB available`);
        
        // Gemma 2 2b is ~1.6GB, 9b is ~5.4GB
        const requiredMB = size === '9b' ? 5600 : 1700;
        if (availableMB > 0 && availableMB < requiredMB) {
          throw new Error(`Insufficient storage. You need at least ${requiredMB}MB free in your browser storage, but only ${availableMB}MB is available.`);
        }
      }

      const genaiFileset = await FilesetResolver.forGenAiTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm"
      );

      // Gemma 2 Model URLs - Using official public MediaPipe models
      // Note: 2B is ~1.6GB, 9B is ~5.4GB
      const modelAssetPath = size === '9b' 
        ? "https://storage.googleapis.com/mediapipe-models/llm_inference/gemma2-9b-it-gpu-int4.bin"
        : "https://storage.googleapis.com/mediapipe-models/llm_inference/gemma2-2b-it-gpu-int4.bin";

      this.gemmaInference = await LlmInference.createFromOptions(genaiFileset, {
        baseOptions: {
          modelAssetPath: modelAssetPath,
        },
        maxTokens: 512,
        topK: 40,
        temperature: 0.7,
        randomSeed: 101,
      });

      localStorage.setItem(`gemma_${size}_downloaded`, 'true');
      localStorage.setItem('gemma_current_size', size);
      this.isDownloading = false;
    } catch (error) {
      this.isDownloading = false;
      console.error(`Gemma 4 ${size} download failed:`, error);
      throw error;
    }
  }

  async generateResponse(
    prompt: string, 
    history: { role: string; parts: { text: string }[] }[],
    preferOffline = false
  ): Promise<AIResponse> {
    const isOnline = navigator.onLine;
    const currentSize = (localStorage.getItem('gemma_current_size') as GemmaModelSize) || '2b';
    const downloaded = await this.isGemmaDownloaded(currentSize);
    const webGPU = await this.isWebGPUSupported();
    const canUseGemma = downloaded && webGPU;

    if (!isOnline || (preferOffline && canUseGemma)) {
      if (canUseGemma) {
        try {
          if (!this.gemmaInference) {
            const genaiFileset = await FilesetResolver.forGenAiTasks(
              "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm"
            );
            const modelAssetPath = currentSize === '9b'
              ? "https://storage.googleapis.com/mediapipe-models/llm_inference/gemma2-9b-it-gpu-int4.bin"
              : "https://storage.googleapis.com/mediapipe-models/llm_inference/gemma2-2b-it-gpu-int4.bin";

            this.gemmaInference = await LlmInference.createFromOptions(genaiFileset, {
              baseOptions: { modelAssetPath }
            });
          }
          
          const formattedPrompt = this.formatHistory(history, prompt);
          const result = await this.gemmaInference!.generateResponse(formattedPrompt);
          
          return {
            text: result,
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
    // Simple formatting for Gemma Instruction Tuned
    let context = "";
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
