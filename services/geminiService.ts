import { GoogleGenAI, Type, Part } from "@google/genai";
import { GEMINI_MODEL_NAME, GEMINI_IMAGE_MODEL_NAME, CAPTION_LANGUAGES, SOURCE_LANGUAGES } from "../constants";
import { AnalysisResult } from "../types";
import { fileToBase64 } from "../utils/fileUtils";

// Ensure API Key is present
const API_KEY = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey: API_KEY });

const getPrompt = (sourceLangCode: string, targetLangCode: string, maxWords: number) => {
  const sourceLangName = SOURCE_LANGUAGES.find(l => l.code === sourceLangCode)?.name || 'Auto-detect';
  
  let targetInstruction = "";
  if (targetLangCode === 'hi_auto') {
    targetInstruction = "captions (subtitles) in the original spoken language. If the audio is in Hindi or Hinglish, ensure the captions are in accurate Hindi/Devanagari script.";
  } else {
    const targetLangName = CAPTION_LANGUAGES.find(l => l.code === targetLangCode)?.name || 'Hindi';
    targetInstruction = `${targetLangName} captions (subtitles)`;
  }

  const sourceInstruction = sourceLangCode === 'auto' 
    ? "Detect the language of the video audio automatically." 
    : `The video audio is in ${sourceLangName}.`;

  return `Analyze the audio and visual content of this video. 
Context: ${sourceInstruction}
Task 1: Generate accurate ${targetInstruction} for the speech in the video. Format strictly as SRT (SubRip Subtitle).
Constraint: Maximum ${maxWords} words per subtitle line. Strictly adhere to this limit. Break longer sentences into multiple lines with accurate timestamps.
Task 2: Analyze the video content and identify top 5 key topics/themes with a relevance score (0-100).
Task 3: Write a short 1-sentence summary of the video in English.

Return the result as a JSON object with keys: 'srt', 'topics' (array of {topic, relevance}), and 'summary'.`;
};

/**
 * Helper to delay execution with abort support
 */
const delayWithAbort = (ms: number, signal?: AbortSignal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new Error("Operation cancelled by user"));
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error("Operation cancelled by user"));
  }, { once: true });
});

/**
 * Helper to retry a function with exponential backoff and abort support
 */
async function retry<T>(fn: () => Promise<T>, retries = 3, delay = 1000, signal?: AbortSignal): Promise<T> {
  try {
    if (signal?.aborted) throw new Error("Operation cancelled by user");
    return await fn();
  } catch (error: any) {
    if (error.message === "Operation cancelled by user") throw error;

    const msg = error.message || "";
    // Retry on fetch failures or specific 5xx errors if needed
    const isNetworkError = msg.includes("fetch") || msg.includes("network") || msg.includes("Failed to upload") || msg.includes("TypeError: Failed to fetch");
    
    if (retries > 0 && isNetworkError) {
      console.warn(`Operation failed, retrying... (${retries} attempts left). Error: ${msg}`);
      try {
        await delayWithAbort(delay, signal);
        return retry(fn, retries - 1, delay * 2, signal);
      } catch (e) {
        throw e; // Rethrow cancel error
      }
    }
    throw error;
  }
}

/**
 * Uploads a file using Gemini Files API and waits for it to be active.
 * Only used for large files to avoid browser memory issues.
 */
async function uploadFileToGemini(
  file: File, 
  onProgress?: (status: string, progress?: number) => void,
  signal?: AbortSignal
): Promise<string> {
  let progressInterval: any;
  
  try {
    // Fallback mimeType if file.type is empty (common with some containers)
    const mimeType = file.type || 'video/mp4';
    
    // Simulate upload progress since SDK doesn't expose it
    if (onProgress) {
      onProgress("Uploading video to Gemini...", 0);
      let progress = 0;
      // Estimate based on 250KB/s upload speed (conservative estimate)
      const estimatedSpeedBytesPerSec = 250 * 1024; 
      const estimatedDurationSecs = Math.max(file.size / estimatedSpeedBytesPerSec, 5);
      const updateRateMs = 500;
      const totalSteps = (estimatedDurationSecs * 1000) / updateRateMs;
      const increment = 95 / totalSteps;

      progressInterval = setInterval(() => {
        if (signal?.aborted) {
           clearInterval(progressInterval);
           return;
        }
        progress = Math.min(progress + increment, 95);
        const noise = Math.random() * 0.2;
        onProgress("Uploading video to Gemini...", Math.floor(progress + noise));
      }, updateRateMs);
    }
    
    // Wrap the upload in a retry block
    const response = await retry(async () => {
      if (signal?.aborted) throw new Error("Operation cancelled by user");
      try {
        return await ai.files.upload({
          file: file,
          config: {
            mimeType: mimeType,
            displayName: file.name
          }
        });
      } catch (e: any) {
        // Enhance error message for common browser fetch issues
        if (e.message && (e.message.includes("Failed to fetch") || e.message.includes("NetworkError"))) {
           throw new Error("Network error during file upload. This may be due to browser CORS restrictions or network instability.");
        }
        throw e;
      }
    }, 3, 2000, signal); // Increased initial delay to 2s

    if (progressInterval) clearInterval(progressInterval);
    
    // Robustly handle response structure
    const uploadedFile = (response as any).file ?? response;

    if (!uploadedFile || !uploadedFile.uri) {
        console.error("Unexpected upload response structure:", response);
        throw new Error("Upload completed but returned invalid file metadata.");
    }
    
    const fileUri = uploadedFile.uri;
    const fileName = uploadedFile.name;
    
    // Initial delay to allow file record propagation
    await delayWithAbort(2000, signal);
    
    // Poll for active state
    let state = uploadedFile.state;
    if (onProgress) onProgress("Processing video on Gemini servers...", undefined); 
    
    while (state === "PROCESSING") {
      if (signal?.aborted) throw new Error("Operation cancelled by user");

      try {
        const fileInfo = await ai.files.get({ name: fileName });
        const currentFile = (fileInfo as any).file ?? fileInfo;
        state = currentFile.state;
        
        if (state === "FAILED") {
          throw new Error("Video processing failed on Gemini servers.");
        }
        if (state === "PROCESSING") {
          await delayWithAbort(5000, signal);
        }
      } catch (e: any) {
        if (e.message === "Operation cancelled by user") throw e;

        // If get fails with 404, it might be propagation delay, retry a few times
        if (e.message?.includes("404") || e.status === 404) {
             console.warn("File not found yet, retrying check...");
             await delayWithAbort(3000, signal);
             continue;
        }
        throw e;
      }
    }
    
    return fileUri;
  } catch (error: any) {
    if (progressInterval) clearInterval(progressInterval);
    if (error.message !== "Operation cancelled by user") {
        console.error("File upload failed", error);
    }
    
    let msg = error.message || "Unknown error";
    if (msg.includes("fetch") || msg.includes("network") || msg.includes("Network error")) {
      msg = "Network error during upload. Please check your internet connection or try a smaller file.";
    }
    // Propagate cancellation error clearly
    if (msg === "Operation cancelled by user") {
        throw error;
    }
    throw new Error(`Failed to upload file to Gemini. ${msg}`);
  }
}

export const generateVideoCaptions = async (
  file: File,
  sourceLang: string,
  targetLang: string,
  maxWords: number,
  onProgress?: (status: string, progress?: number) => void,
  signal?: AbortSignal
): Promise<AnalysisResult> => {
  
  if (!API_KEY) {
    throw new Error("API Key is missing. Please check your environment configuration.");
  }

  try {
    if (signal?.aborted) throw new Error("Operation cancelled by user");

    let contentPart: Part;

    // Strategy: < 20MB inline, >= 20MB via Files API
    // Increased from 10MB to 20MB to rely less on Files API for medium-sized clips
    const INLINE_LIMIT_BYTES = 20 * 1024 * 1024; // 20 MB

    if (file.size < INLINE_LIMIT_BYTES) {
      if (onProgress) onProgress("Reading video file...", undefined);
      const base64Video = await fileToBase64(file);
      contentPart = {
        inlineData: {
          mimeType: file.type || 'video/mp4',
          data: base64Video
        }
      };
    } else {
      // Large file flow
      const fileUri = await uploadFileToGemini(file, onProgress, signal);
      contentPart = {
        fileData: {
          fileUri: fileUri,
          mimeType: file.type || 'video/mp4'
        }
      };
    }

    if (signal?.aborted) throw new Error("Operation cancelled by user");
    if (onProgress) onProgress("Generating captions and insights...", undefined);
    
    const prompt = getPrompt(sourceLang, targetLang, maxWords);

    // Add retry for generateContent as well
    const response = await retry(async () => {
        if (signal?.aborted) throw new Error("Operation cancelled by user");
        return await ai.models.generateContent({
          model: GEMINI_MODEL_NAME,
          contents: {
            parts: [
              contentPart,
              { text: prompt }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                srt: { type: Type.STRING, description: `The full SRT formatted subtitle string.` },
                summary: { type: Type.STRING, description: "A brief English summary of the video." },
                topics: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      topic: { type: Type.STRING },
                      relevance: { type: Type.NUMBER }
                    }
                  }
                }
              }
            }
          }
        });
    }, 3, 2000, signal);

    if (signal?.aborted) throw new Error("Operation cancelled by user");

    const text = response.text;
    if (!text) throw new Error("No response received from Gemini.");

    const result = JSON.parse(text) as AnalysisResult;
    return result;

  } catch (error: any) {
    if (error.message !== "Operation cancelled by user") {
      console.error("Gemini API Error:", error);
    }
    // Provide cleaner error messages for 404s
    if (JSON.stringify(error).includes("404")) {
        throw new Error("The requested Gemini model or file was not found. Please try again or check API availability.");
    }
    throw error;
  }
};

/**
 * Edit an image using Gemini 2.5 Flash Image with a text prompt.
 */
export const editImage = async (
  imageFile: File,
  prompt: string,
  signal?: AbortSignal
): Promise<string> => {
  if (!API_KEY) throw new Error("API Key is missing.");

  try {
    const base64Image = await fileToBase64(imageFile);

    if (signal?.aborted) throw new Error("Operation cancelled by user");

    const response = await ai.models.generateContent({
      model: GEMINI_IMAGE_MODEL_NAME,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: imageFile.type,
              data: base64Image,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    });

    if (signal?.aborted) throw new Error("Operation cancelled by user");

    // The response should contain the generated image in one of the parts.
    if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
      }
    }
    
    throw new Error("The model did not return an image. It might have returned text instead.");

  } catch (error: any) {
    if (error.message !== "Operation cancelled by user") {
       console.error("Gemini Image Edit Error:", error);
    }
    throw error;
  }
};