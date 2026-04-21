// FILE: apps/worker/src/lib/plans.ts
// This file defines the 3-tier billing plan constants for the PharmIQ Stock Transfer Worker.
// PlanTier: the set of valid plan tiers (free, pro, enterprise)
// PLAN_LIMITS: the match run and store count limits for each tier

export type PlanTier = 'free' | 'pro' | 'enterprise';

export interface PlanLimits {
  matchRuns: number; // Infinity for unlimited (enterprise)
  stores: number;    // Infinity for unlimited (enterprise)
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free:       { matchRuns: 1,        stores: 3 },
  pro:        { matchRuns: 10,       stores: 10 },
  enterprise: { matchRuns: Infinity, stores: Infinity },
};
