/**
 * Feature flags. Toggle via env vars (build-time, both client & server):
 *   VITE_FEATURE_NOTES=true    → encrypted notebook / notes
 *   VITE_FEATURE_SHARING=true  → shared shelves (invite links, view-only links, join)
 *
 * Flags default OFF — a feature is only on when its env var is "true" or "1".
 */
function flag(value: string | undefined): boolean {
  return value === 'true' || value === '1'
}

export const features = {
  notes: flag(import.meta.env.VITE_FEATURE_NOTES),
  sharing: flag(import.meta.env.VITE_FEATURE_SHARING),
} as const
