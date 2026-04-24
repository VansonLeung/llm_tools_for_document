import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));

export const config = {
  backendRoot,
  port: Number(process.env.PORT || 28118),
  corsOrigins: (process.env.CORS_ORIGIN || "https://oct-ext81-17.octopus-tech.com,https://oct-ext81-18.octopus-tech.com,http://localhost:28117,http://127.0.0.1:28117")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  storageDir: process.env.STORAGE_DIR || path.join(backendRoot, "storage", "uploads"),
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini"
};