// ─── Similarity Search ────────────────────────────────────────────────────────
// Brute-force semantic search using cosine similarity

import { generateEmbeddings } from "~/lib/ollama/client"
import { EMBED_MODEL, MAX_CONTEXT_CHUNKS, SIMILARITY_THRESHOLD } from "~/lib/ollama/models"
import type { PageSnapshot } from "~/types/page"

// ─── ScoredChunk type ────────────────────────────────────────────────────────
export interface ScoredChunk {
  url: string
  title: string
  chunk: string
  score: number
}

// ─── Cosine Similarity ────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must be same length")
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) {
    return 0
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ─── Query Embedding Generation ───────────────────────────────────────────────

export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const embeddings = await generateEmbeddings(EMBED_MODEL, [query])
  return embeddings[0]
}

// ─── Semantic Search ──────────────────────────────────────────────────────────

export async function semanticSearch(
  query: string,
  snapshots: PageSnapshot[]
): Promise<ScoredChunk[]> {
  const queryEmbedding = await generateQueryEmbedding(query)
  const results: ScoredChunk[] = []

  for (const snapshot of snapshots) {
    // Compare query embedding against each chunk embedding
    for (let i = 0; i < snapshot.embeddings.length; i++) {
      const chunkEmbedding = snapshot.embeddings[i]
      const score = cosineSimilarity(queryEmbedding, chunkEmbedding)

      if (score >= SIMILARITY_THRESHOLD) {
        results.push({
          url: snapshot.url,
          title: snapshot.title,
          chunk: snapshot.chunks[i],
          score
        })
      }
    }
  }

  // Sort by score descending and take top results
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, MAX_CONTEXT_CHUNKS)
}

// ─── Find best matching chunk ─────────────────────────────────────────────────

export async function findBestMatchingChunk(
  query: string,
  snapshots: PageSnapshot[]
): Promise<ScoredChunk | null> {
  const results = await semanticSearch(query, snapshots)
  return results.length > 0 ? results[0] : null
}
