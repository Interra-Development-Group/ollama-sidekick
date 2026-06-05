// ─── Page Content Types ───────────────────────────────────────────────────────

export interface PageSnapshot {
  id: string
  url: string
  title: string
  text: string
  chunks: string[]
  embeddings: number[][]
  crawledAt: number
  wordCount: number
  summary?: string      // LLM-generated 2-3 sentence summary
  parentUrl?: string    // set for depth-1 discovered pages
  depth?: number        // 0 = favorited directly, 1 = discovered via link
}

export interface PageContent {
  url: string
  title: string
  text: string
  selection: string
}
