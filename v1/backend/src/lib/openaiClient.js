import OpenAI from "openai";
import { config } from "../config.js";

let cachedClient = null;

export function getOpenAIClient() {
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseUrl || undefined
    });
  }

  return cachedClient;
}