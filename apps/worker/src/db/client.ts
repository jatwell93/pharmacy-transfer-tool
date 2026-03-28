import { neon } from '@neondatabase/serverless';
import type { NeonQueryFunctionInTransaction } from '@neondatabase/serverless';

// withOrgContext creates a NEON DB connection with RLS context injected.
// The org_id is set via set_config('request.jwt.claims', ..., true) inside a transaction
// so that Postgres RLS policies can enforce per-org row isolation at the database layer.
// This is defence-in-depth — the application layer also scopes by org_id (AUTH-02).
//
// IMPORTANT: The NEON HTTP transaction API requires a *synchronous* callback that returns
// an array of NeonQueryInTransaction items. The callback receives a transaction-scoped sql
// function (tx) and must return [tx`...`, tx`...`] — no async/await inside.
// The results array has the same structure: results[0] = set_config result, results[1] = query result.
export async function withOrgContext<T>(
  databaseUrl: string,
  orgId: string,
  fn: (tx: NeonQueryFunctionInTransaction<false, false>) => ReturnType<NeonQueryFunctionInTransaction<false, false>>
): Promise<T> {
  const sql = neon(databaseUrl);
  const claims = JSON.stringify({ org_id: orgId });

  // Use a transaction to:
  // 1. SET LOCAL the JWT claims for this request (RLS reads this via current_setting)
  // 2. Execute the caller's query within the same transaction
  // The callback MUST be synchronous — NEON HTTP transactions are non-interactive.
  const results = await sql.transaction((tx) => [
    tx`SELECT set_config('request.jwt.claims', ${claims}, true)`,
    fn(tx),
  ]);

  // results[0] is the set_config result, results[1] is the caller's query result
  return results[1] as T;
}
