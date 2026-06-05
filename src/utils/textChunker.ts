// ─── Text Chunker ─────────────────────────────────────────────────────────────
// Splits long text into chunks for embedding

export interface ChunkOptions {
  size: number      // Max characters per chunk
  overlap: number   // Overlap between chunks
}

export const textChunker = {
  /**
   * Split text into overlapping chunks
   */
  chunk(text: string, options: ChunkOptions): string[] {
    const { size, overlap } = options
    if (!text || text.length === 0) return []
    if (text.length <= size) return [text.trim()].filter(Boolean)

    const chunks: string[] = []
    let start = 0

    while (start < text.length) {
      const end = Math.min(start + size, text.length)
      const slice = text.substring(start, end)

      if (end === text.length) {
        const tail = slice.trim()
        if (tail.length > 10) chunks.push(tail)
        break
      }

      // Find the best natural break point within this slice
      const lastPeriod = slice.lastIndexOf(". ")
      const lastNewline = slice.lastIndexOf("\n")
      const lastSpace = slice.lastIndexOf(" ")

      let localBreak: number
      if (lastPeriod > size * 0.4) {
        localBreak = lastPeriod + 1
      } else if (lastNewline > size * 0.4) {
        localBreak = lastNewline + 1
      } else if (lastSpace > size * 0.3) {
        localBreak = lastSpace + 1
      } else {
        localBreak = slice.length
      }

      const absBreak = start + localBreak
      const trimmed = text.substring(start, absBreak).trim()
      if (trimmed.length > 0) chunks.push(trimmed)

      // Always advance past the current start to prevent infinite loops
      start = Math.max(start + 1, absBreak - overlap)
    }

    return chunks
  },

  /**
   * Merge overlapping chunks back together
   */
  merge(chunks: string[]): string {
    if (chunks.length === 0) return ""
    if (chunks.length === 1) return chunks[0]

    // Find overlap between adjacent chunks
    let result = chunks[0]

    for (let i = 1; i < chunks.length; i++) {
      result += " " + chunks[i]
    }

    return result
  },

  /**
   * Get character count across all chunks
   */
  totalLength(chunks: string[]): number {
    return chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  }
}
