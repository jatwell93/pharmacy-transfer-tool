import { useState, useCallback, useEffect, useRef } from 'react';
import { Loader2, X, ArrowRight } from 'lucide-react';
import AppShell from '../components/AppShell';
import { useUsage } from '../hooks/useUsage';
import { useFetch } from '../hooks/useFetch';

// --- Plan display constants (client-side copy only — server enforces limits) ---

const TIER_DISPLAY = [
  { tier: 'free' as const, name: 'Free', price: '$0 /mo', matchRuns: '1 match run / month', stores: 'Up to 3 stores', upgradeTo: 'pro' as const },
  { tier: 'pro' as const, name: 'Pro', price: '$10 /mo AUD', matchRuns: '10 match runs / month', stores: 'Up to 10 stores', upgradeTo: 'enterprise' as const },
  { tier: 'enterprise' as const, name: 'Enterprise', price: '$100 /mo AUD', matchRuns: 'Unlimited match runs', stores: 'Unlimited stores', upgradeTo: null },
] as const;

// --- Helper functions ---

function tierOrder(tier: string): number {
  if (tier === 'enterprise') return 2;
  if (tier === 'pro') return 1;
  return 0;
}

function storeLimit(tier: string): string {
  if (tier === 'enterprise') return '\u221E';
  if (tier === 'pro') return '10';
  return '3';
}

// Usage row color classes per UI-SPEC Interaction States
function usageColorClass(count: number, limit: number): string {
  if (limit === -1) return 'text-[var(--color-text-secondary)]'; // unlimited
  if (count >= limit) return 'text-[#EF4444]'; // at cap — red
  if (count >= limit * 0.8) return 'text-[#D97706]'; // >=80% — amber
  return 'text-[var(--color-text-secondary)]'; // neutral
}

function storeColorClass(storeCount: number, tier: string): string {
  const max = tier === 'enterprise' ? Infinity : tier === 'pro' ? 10 : 3;
  if (max === Infinity) return 'text-[var(--color-text-secondary)]';
  if (storeCount >= max) return 'text-[#EF4444]';
  if (storeCount >= max * 0.8) return 'text-[#D97706]';
  return 'text-[var(--color-text-secondary)]';
}

// --- BillingPage component ---

export default function BillingPage() {
  const { usage, loading, refresh } = useUsage();
  const fetchApi = useFetch();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null); // tier being checked out
  const [portalLoading, setPortalLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [checkoutConfirming, setCheckoutConfirming] = useState(false);
  const [checkoutError, setCheckoutError] = useState(false);

  // Capture plan_tier before checkout so we can detect actual change if needed as a fallback safety net
  const tierBeforeCheckout = useRef<string | null>(null);

  // Effect: On checkout=success, call the synchronous session confirm endpoint (BILLING-09)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') !== 'success') return;

    const sessionId = params.get('session_id');
    if (!sessionId) {
      setCheckoutError(true);
      return;
    }

    // Capture current tier before checkout for change detection
    tierBeforeCheckout.current = usage?.plan_tier ?? 'free';
    setCheckoutConfirming(true);
    let cancelled = false;

    const confirmCheckout = async () => {
      try {
        const res = await fetchApi(`/api/billing/checkout-session/${sessionId}`);
        if (cancelled) return;

        if (res.ok) {
          const data = (await res.json()) as { plan_tier: string };
          // Refresh usage to pick up the new plan_tier written by the endpoint
          await refresh();
          if (cancelled) return;

          setCheckoutConfirming(false);
          const tierName = data.plan_tier === 'enterprise' ? 'PharmIQ Enterprise' : 'PharmIQ Pro';
          setToastMessage(`You're now on ${tierName}`);
          setTimeout(() => setToastMessage(null), 3000);
          window.history.replaceState({}, '', '/billing');
        } else {
          if (cancelled) return;
          setCheckoutError(true);
          setCheckoutConfirming(false);
        }
      } catch {
        if (cancelled) return;
        setCheckoutError(true);
        setCheckoutConfirming(false);
      }
    };

    confirmCheckout();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // handleUpgrade — calls create-checkout with tier param (D-04, D-17)
  const handleUpgrade = useCallback(async (tier: 'pro' | 'enterprise') => {
    setCheckoutLoading(tier);
    try {
      const res = await fetchApi('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      if (res.ok) {
        const { url } = (await res.json()) as { url: string };
        window.location.href = url;
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setCheckoutLoading(null);
    }
  }, [fetchApi]);

  // handleManageSubscription — opens Stripe Customer Portal (D-05, D-06)
  const handleManageSubscription = useCallback(async () => {
    setPortalLoading(true);
    try {
      const res = await fetchApi('/api/billing/create-portal-session', { method: 'POST' });
      if (res.ok) {
        const { url } = (await res.json()) as { url: string };
        window.location.href = url;
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setPortalLoading(false);
    }
  }, [fetchApi]);

  return (
    <AppShell>
      {/* Toast notification (D-11) */}
      {toastMessage && (
        <div
          className="fixed top-4 right-4 z-50 rounded-lg bg-[#0F766E] text-white px-5 py-4 flex items-center gap-3 shadow-lg max-w-sm"
          role="status"
          aria-live="polite"
        >
          <span className="text-[13px] font-medium" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            {toastMessage}
          </span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-white/70 hover:text-white"
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Page header (D-01) */}
      <h1
        className="text-[20px] font-semibold text-[var(--color-text-primary)] tracking-[-0.01em] mb-6"
        style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
      >
        Billing
      </h1>

      {loading ? (
        <p className="text-[13px] text-[var(--color-text-muted)]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
          Loading billing info...
        </p>
      ) : !usage ? (
        <p className="text-[13px] text-[var(--color-text-muted)]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
          Could not load billing info. Refresh the page to try again.
        </p>
      ) : checkoutConfirming ? (
        /* Checkout confirming spinner state (D-10) */
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2
            className="animate-spin"
            size={24}
            style={{ color: '#0F766E' }}
            aria-label="Confirming upgrade"
          />
          <p className="text-[13px] text-[var(--color-text-muted)]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            Confirming your upgrade...
          </p>
        </div>
      ) : checkoutError ? (
        /* Session fetch failure state (D-12) */
        <div className="rounded-xl border-2 border-[var(--color-critical)] bg-[var(--color-surface-gray)] p-6 max-w-md">
          <p className="text-[13px] text-[var(--color-text-primary)] mb-4" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            Upgrade confirmation failed — please refresh or contact support.
          </p>
          <button
            onClick={() => { setCheckoutError(false); window.location.reload(); }}
            className="bg-[#0F766E] text-white text-[13px] font-semibold rounded-md px-4 min-h-[44px] hover:bg-[#0D5D5A] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E]"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Usage row (D-01) */}
          <div
            className="bg-[var(--color-surface-gray)] rounded-lg px-4 py-3 mb-6"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            <span className={`text-[13px] ${usageColorClass(usage.count, usage.limit)}`}>
              Match runs: {usage.count}/{usage.limit === -1 ? '\u221E' : usage.limit} this month
            </span>
            <span className="text-[13px] text-[var(--color-text-secondary)] mx-2">{'\u2022'}</span>
            <span className={`text-[13px] ${storeColorClass(usage.store_count, usage.plan_tier)}`}>
              Stores: {usage.store_count}/{storeLimit(usage.plan_tier)}
            </span>
          </div>

          {/* Pricing cards (D-02, D-03, D-04) */}
          <div className="flex gap-6 mb-8">
            {TIER_DISPLAY.map(tierInfo => {
              const isCurrent = usage.plan_tier === tierInfo.tier;
              const isHigherTier = tierOrder(tierInfo.tier) > tierOrder(usage.plan_tier);

              return (
                <div
                  key={tierInfo.tier}
                  className={`rounded-xl border-2 bg-[var(--color-surface-gray)] p-6 flex flex-col gap-4 flex-1 ${
                    isCurrent ? 'border-[#0F766E]' : 'border-[var(--color-border-light)]'
                  }`}
                >
                  {/* Current plan badge (D-03) */}
                  {isCurrent && (
                    <span className="inline-flex items-center self-start rounded-full bg-[#0F766E] text-white text-[12px] font-semibold px-3 py-1">
                      Current plan
                    </span>
                  )}

                  {/* Plan name */}
                  <h2
                    className="text-[20px] font-semibold text-[var(--color-text-primary)]"
                    style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", lineHeight: '1.2' }}
                  >
                    {tierInfo.name}
                  </h2>

                  {/* Price */}
                  <p className="text-[20px] font-semibold text-[var(--color-text-primary)]" style={{ lineHeight: '1.2' }}>
                    {tierInfo.price.split(' ')[0]}
                    <span className="text-[13px] font-normal text-[var(--color-text-secondary)]">
                      {' '}{tierInfo.price.split(' ').slice(1).join(' ')}
                    </span>
                  </p>

                  {/* Limits */}
                  <div className="flex flex-col gap-1">
                    <p className="text-[13px] text-[var(--color-text-secondary)]">{tierInfo.matchRuns}</p>
                    <p className="text-[13px] text-[var(--color-text-secondary)]">{tierInfo.stores}</p>
                  </div>

                  {/* CTA button (D-04) */}
                  <div className="mt-auto">
                    {isCurrent ? null : isHigherTier && tierInfo.tier !== 'free' ? (
                      <button
                        onClick={() => handleUpgrade(tierInfo.tier as 'pro' | 'enterprise')}
                        disabled={checkoutLoading !== null}
                        className="w-full min-h-[44px] rounded-md text-[13px] font-semibold bg-[#0F766E] text-white hover:bg-[#0D5D5A] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E] disabled:opacity-50"
                        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                      >
                        {checkoutLoading === tierInfo.tier ? (
                          <Loader2 className="animate-spin mx-auto" size={16} />
                        ) : (
                          `Upgrade to ${tierInfo.name}`
                        )}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Manage subscription link (D-05) */}
          {usage.plan_tier !== 'free' && (
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="text-[13px] text-[#0F766E] hover:underline flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E] min-h-[44px]"
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              Manage subscription
              {portalLoading ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <ArrowRight size={14} />
              )}
            </button>
          )}
        </>
      )}
    </AppShell>
  );
}
