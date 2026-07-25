/**
 * Build-time feature flags (env). Prefer per-user DB flags in
 * `user_feature_flags` for rollouts that should be toggled without redeploying.
 *
 *   VITE_FEATURE_NOTES=true  → encrypted notebook / notes
 *
 * Flags default OFF — a feature is only on when its env var is "true" or "1".
 */
function flag(value: string | undefined): boolean {
  return value === 'true' || value === '1'
}

export const features = {
  notes: flag(import.meta.env.VITE_FEATURE_NOTES),
} as const
