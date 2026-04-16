-- Phase 11 migration: v1.1 schema additions
-- Adds cost_ex to dead_stock, plan_tier + stripe_price_id to subscriptions,
-- and migrates any existing paid subscription rows to plan_tier='pro'.
--
-- Idempotency: all statements use IF NOT EXISTS so this file is safe to re-run.
-- The UPDATE at the end is idempotent by construction (setting pro->pro is a no-op).
--
-- Run as `neondb_owner` role (DDL requires ownership). Application queries continue
-- to use `pharmiq_app` role (BYPASSRLS=false). See schema.sql lines 3-4.
--
-- Execution: NEON SQL Editor (console.neon.tech → SQL Editor) OR
--            psql "$DATABASE_URL" -f apps/worker/src/db/migrations/002-v1.1-schema.sql

-- 1. Add cost_ex to dead_stock (nullable — absent from pre-v1.1 uploads)
ALTER TABLE dead_stock
  ADD COLUMN IF NOT EXISTS cost_ex DOUBLE PRECISION;

-- 2. Add plan_tier to subscriptions (NOT NULL with DEFAULT so existing rows get 'free')
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'free';

-- 3. Add stripe_price_id to subscriptions (nullable — set at checkout or webhook time)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

-- 4. Migrate existing paid rows to pro tier (no-op if no paid rows exist)
UPDATE subscriptions
  SET plan_tier = 'pro'
  WHERE status = 'paid';
