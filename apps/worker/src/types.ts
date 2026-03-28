export interface Env {
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  DATABASE_URL: string;
  ALLOWED_ORIGIN: string;
}

export interface Variables {
  orgId: string;
}
