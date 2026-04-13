-- PharmIQ Stock Transfer — v1 Schema
-- Run once against the NEON database via the NEON SQL editor or console.
-- IMPORTANT: Use a DATABASE_URL that connects as 'pharmiq_app' role (not neondb_owner).
-- The neondb_owner role has BYPASSRLS = true, which silently disables all RLS policies.

-- Create application role (no BYPASSRLS)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pharmiq_app') THEN
    CREATE ROLE pharmiq_app NOLOGIN NOINHERIT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS orgs (
  org_id      TEXT PRIMARY KEY,
  plan        TEXT NOT NULL DEFAULT 'free',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stores (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  store_number TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

CREATE TABLE IF NOT EXISTS rou_data (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL,
  description TEXT,
  rou         DOUBLE PRECISION,
  soh         DOUBLE PRECISION,
  is_ranged   BOOLEAN NOT NULL DEFAULT false,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dead_stock (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL,
  description TEXT,
  soh         DOUBLE PRECISION,
  is_ranged   BOOLEAN NOT NULL DEFAULT false,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_meters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  year_month  TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  UNIQUE(org_id, year_month)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  status                  TEXT NOT NULL DEFAULT 'free',
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stores_org ON stores(org_id);
CREATE INDEX IF NOT EXISTS idx_rou_data_org ON rou_data(org_id);
CREATE INDEX IF NOT EXISTS idx_rou_data_store ON rou_data(store_id);
CREATE INDEX IF NOT EXISTS idx_rou_data_sku ON rou_data(sku);
CREATE INDEX IF NOT EXISTS idx_dead_stock_org ON dead_stock(org_id);
CREATE INDEX IF NOT EXISTS idx_dead_stock_store ON dead_stock(store_id);
CREATE INDEX IF NOT EXISTS idx_dead_stock_sku ON dead_stock(sku);
CREATE INDEX IF NOT EXISTS idx_usage_meters_org ON usage_meters(org_id);

-- Enable RLS on all tables
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orgs FORCE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores FORCE ROW LEVEL SECURITY;
ALTER TABLE rou_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE rou_data FORCE ROW LEVEL SECURITY;
ALTER TABLE dead_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE dead_stock FORCE ROW LEVEL SECURITY;
ALTER TABLE usage_meters ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_meters FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;

-- RLS policies: restrict all access to the authenticated org
-- The org_id is sourced from request.jwt.claims set via withOrgContext() in db/client.ts.
-- Never trust org_id from request body or query params (AUTH-02).
CREATE POLICY org_isolation ON orgs FOR ALL USING (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id'));
CREATE POLICY org_isolation ON stores FOR ALL USING (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id'));
CREATE POLICY org_isolation ON rou_data FOR ALL USING (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id'));
CREATE POLICY org_isolation ON dead_stock FOR ALL USING (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id'));
CREATE POLICY org_isolation ON usage_meters FOR ALL USING (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id'));
CREATE POLICY org_isolation ON subscriptions FOR ALL USING (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id'));

-- Grant permissions to app role (no BYPASSRLS)
-- Verify: SELECT rolbypassrls FROM pg_roles WHERE rolname = 'pharmiq_app'; -- must return 'f'
GRANT SELECT, INSERT, UPDATE, DELETE ON orgs, stores, rou_data, dead_stock, usage_meters, subscriptions TO pharmiq_app;
