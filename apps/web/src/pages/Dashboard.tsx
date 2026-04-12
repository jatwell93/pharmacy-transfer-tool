import { Upload, GitCompare, ArrowRight } from 'lucide-react';
import AppShell from '../components/AppShell';
import { useStores } from '../hooks/useStores';

export default function Dashboard() {
  const { stores, loading } = useStores();

  const hasStores = stores.length > 0;
  const readyStores = stores.filter(s => s.rouUploadedAt && s.dsUploadedAt).length;

  return (
    <AppShell>
      <div className="max-w-xl">
        {loading ? (
          <div className="flex items-center gap-2 text-[var(--color-text-muted)] text-[13px]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            <span>Loading...</span>
          </div>
        ) : !hasStores ? (
          /* Empty state */
          <>
            <h1
              className="text-2xl font-semibold text-[var(--color-text-primary)] tracking-[-0.01em] mb-3"
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
            >
              Welcome to PharmIQ
            </h1>
            <p className="text-[15px] text-[var(--color-text-secondary)] mb-2" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
              Turn dead stock into cash flow. Start by uploading ROU and dead-stock reports for each store in your pharmacy group.
            </p>
            <p className="text-[13px] text-[var(--color-text-muted)] mb-8" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
              Once uploaded, PharmIQ will identify which stores can profitably transfer stock to each other — keeping receiving stores from becoming overstocked.
            </p>
            <a
              href="/upload"
              className="inline-flex items-center gap-2 bg-[var(--color-teal)] text-white font-semibold rounded-md px-5 py-3 text-[14px] hover:bg-[var(--color-teal-dark)] transition-colors"
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              <Upload size={16} aria-hidden="true" />
              Upload Store Reports
              <ArrowRight size={16} aria-hidden="true" />
            </a>
          </>
        ) : (
          /* Populated state */
          <>
            <h1
              className="text-2xl font-semibold text-[var(--color-text-primary)] tracking-[-0.01em] mb-3"
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
            >
              Ready to run a match
            </h1>
            <p className="text-[15px] text-[var(--color-text-secondary)] mb-1" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
              {stores.length} store{stores.length !== 1 ? 's' : ''} uploaded
              {readyStores > 0 && readyStores < stores.length && ` · ${readyStores} fully ready`}
              {readyStores === stores.length && ` · all fully ready`}
            </p>
            <p className="text-[13px] text-[var(--color-text-muted)] mb-8" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
              Select your months-cover target and run the matching algorithm to find transfer opportunities across your network.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="/match"
                className="inline-flex items-center gap-2 bg-[var(--color-teal)] text-white font-semibold rounded-md px-5 py-3 text-[14px] hover:bg-[var(--color-teal-dark)] transition-colors"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                <GitCompare size={16} aria-hidden="true" />
                Run Match
                <ArrowRight size={16} aria-hidden="true" />
              </a>
              <a
                href="/upload"
                className="inline-flex items-center gap-2 text-[var(--color-text-secondary)] text-[13px] hover:text-[var(--color-text-primary)] transition-colors"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                <Upload size={14} aria-hidden="true" />
                Manage stores
              </a>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
