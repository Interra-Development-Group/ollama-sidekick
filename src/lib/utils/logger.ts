// ─── Dev-gated logger ─────────────────────────────────────────────────────────
// log/warn only fire in development builds; error always fires.

const dev = process.env.NODE_ENV !== "production"

/* eslint-disable no-console */
export const log = (...args: unknown[]): void => { if (dev) console.log(...args) }
export const warn = (...args: unknown[]): void => { if (dev) console.warn(...args) }
export const error = (...args: unknown[]): void => console.error(...args)
