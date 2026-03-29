-- Phase 3 migration: add store_number column to stores table (per CONTEXT.md D-01, D-03)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS store_number TEXT;
