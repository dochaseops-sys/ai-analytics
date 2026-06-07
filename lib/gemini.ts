import { GoogleGenerativeAI } from '@google/generative-ai';

export const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API Key is not configured on the server.');
  }
  return new GoogleGenerativeAI(apiKey);
};

export interface GenerateContentOptions {
  systemInstruction?: string;
  chatHistory?: Array<{ role: string; parts: Array<{ text: string }> }>;
  responseMimeType?: string;
  temperature?: number;
}

/**
 * Generates content using the Gemini API, with built-in retries and fallback models.
 * If gemini-3.5-flash experiences 503 high demand or 429 rate limit, it falls back to
 * gemini-2.5-flash, and then gemini-2.5-flash-lite.
 */
export async function generateContentWithRetry(
  prompt: string,
  options: GenerateContentOptions = {}
): Promise<string> {
  const genAI = getGeminiClient();
  const models = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  
  let lastError: any = null;

  for (const modelName of models) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: options.responseMimeType
        ? { responseMimeType: options.responseMimeType }
        : undefined,
      systemInstruction: options.systemInstruction,
    });

    const maxRetries = 2; // 3 attempts total per model
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (options.chatHistory) {
          const chat = model.startChat({
            history: options.chatHistory,
          });
          const result = await chat.sendMessage(prompt);
          return result.response.text();
        } else {
          const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
          });
          return result.response.text();
        }
      } catch (error: any) {
        lastError = error;
        const status = error?.status || error?.statusCode;
        const message = error?.message || '';

        console.warn(
          `[Gemini] Attempt ${attempt + 1} with model ${modelName} failed. Status: ${status}, Message: ${message}`
        );

        // Fail immediately on client errors (400 Bad Request)
        if (status === 400 || message.includes('400')) {
          break;
        }

        // Wait with exponential backoff before retrying
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  throw lastError || new Error('All Gemini models failed to generate content.');
}
