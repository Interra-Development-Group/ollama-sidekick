// ─── Ollama Model Configuration Constants ─────────────────────────────────────

import { getEnv } from "~/lib/utils/env"

export const DEFAULT_CHAT_MODEL = "llama3.2"
export const DEFAULT_EMBED_MODEL = "nomic-embed-text"

export const OLLAMA_BASE_URL = getEnv("OLLAMA_BASE_URL", "http://localhost:11434")

export const CHAT_MODEL = getEnv("CHAT_MODEL", DEFAULT_CHAT_MODEL)
export const EMBED_MODEL = getEnv("EMBED_MODEL", DEFAULT_EMBED_MODEL)

export const MAX_CONTEXT_CHUNKS = parseInt(getEnv("MAX_CONTEXT_CHUNKS", "5"), 10)
export const SIMILARITY_THRESHOLD = parseFloat(getEnv("SIMILARITY_THRESHOLD", "0.45"))
export const PAGE_TEXT_MAX_CHARS = parseInt(getEnv("PAGE_TEXT_MAX_CHARS", "6000"), 10)
