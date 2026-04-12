import { useCallback } from 'react';
import { CreditCard } from 'lucide-react';
import AppShell from '../components/AppShell';
import { useUsage } from '../hooks/useUsage';
import { useFetch } from '../hooks/useFetch';

export default function BillingPage() {
  const { usage, loading } = useUsage();
  const fetchApi = useFetch();

  const handleUpgrade = useCallback(async () => {
    try {
      const res = await fetchApi('/api/billing/create-checkout', { method: 'POST' });
      if (res.ok) {
        const { url } = (await res.json()) as { url: string };
        window.location.href = url;
      }
    } catch {
      // Silently fail — user can retry
    }
  }, [fetchApi]);

  return (
    <AppShell>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl font-semibold text-[var(--color-text-primary)] tracking-[-0.01em]"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          Billing
        </h1>
      </div>

      {/* Plan card */}
      <div
        className="max-w-md rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface-gray)] p-6"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        {loading ? (
          <p className="text-[13px] text-[var(--color-text-muted)]">Loading billing info...</p>
        ) : usage ? (
          <>
            {/* Plan name */}
            <div className="flex items-center gap-2 mb-4">
              <CreditCard size={18} className="text-[var(--color-teal)]" aria-hidden="true" />
              <span className="text-[15px] font-semibold text-[var(--color-text-primary)]">
                {usage.plan === 'paid' ? 'PharmIQ Pro' : 'Free Plan'}
              </span>
            </div>

            {usage.plan === 'free' ? (
              <>
                {/* Usage stats for free orgs */}
                <p className="text-[13px] text-[var(--color-text-secondary)] mb-1">
                  Match runs this month
                </p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)] mb-4">
                  {usage.count} <span className="text-[15px] font-normal text-[var(--color-text-secondary)]">of {usage.limit}</span>
                </p>

                {/* Upgrade CTA */}
                <button
                  onClick={handleUpgrade}
                  className="w-full bg-[#D97706] text-white font-semibold rounded-md px-4 py-3 hover:bg-[#B45309] transition-colors"
                >
                  Upgrade to PharmIQ Pro
                </button>
                <p className="text-[12px] text-[var(--color-text-muted)] mt-2 text-center">
                  Unlimited match runs. Cancel anytime.
                </p>
              </>
            ) : (
              <>
                {/* Paid plan message (D-11) */}
                <p className="text-[13px] text-[var(--color-text-secondary)]">
                  Paid plan — unlimited runs
                </p>
              </>
            )}
          </>
        ) : (
          <p className="text-[13px] text-[var(--color-text-muted)]">Could not load billing info.</p>
        )}
      </div>
    </AppShell>
  );
}
