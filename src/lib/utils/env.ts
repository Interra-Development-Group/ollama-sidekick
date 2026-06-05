// ─── Environment Helper ───────────────────────────────────────────────────────
// Plasmo uses PLASMO_PUBLIC_ prefix for environment variables

const env: Record<string, string | undefined> = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>

export function getEnv(name: string, defaultValue: string): string {
  const value = env[`PLASMO_PUBLIC_${name}`] ?? env[name] ?? defaultValue
  return value
}

export function getEnvNumber(name: string, defaultValue: number): number {
  const value = env[`PLASMO_PUBLIC_${name}`] ?? env[name]
  return value ? parseFloat(value) : defaultValue
}

export function getEnvBoolean(name: string, defaultValue: boolean): boolean {
  const value = env[`PLASMO_PUBLIC_${name}`] ?? env[name]
  return value ? value === "true" : defaultValue
}
