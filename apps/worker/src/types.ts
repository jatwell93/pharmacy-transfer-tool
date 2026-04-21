export interface Env {
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  DATABASE_URL: string;
  ALLOWED_ORIGIN: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID: string;            // kept for backward compat (existing tests reference it)
  STRIPE_PRICE_ID_PRO: string;        // Stripe price ID for Pro tier ($10/mo)
  STRIPE_PRICE_ID_ENTERPRISE: string; // Stripe price ID for Enterprise tier ($100/mo)
}

export interface Variables {
  orgId: string;
}
