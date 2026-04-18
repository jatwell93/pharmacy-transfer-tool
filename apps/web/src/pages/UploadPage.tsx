import React, { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import AppShell from '../components/AppShell';
import StoreCard from '../components/StoreCard';
import UploadModal from '../components/UploadModal';
import { useStores, Store } from '../hooks/useStores';
import { useDeadStockSummary } from '../hooks/useDeadStockSummary';
import { DeadStockChart } from '../components/DeadStockChart';

export default function UploadPage() {
  const { stores, loading, error, refresh } = useStores();
  const { summary, loading: summaryLoading, refetch: summaryRefetch } = useDeadStockSummary();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);

  function handleAddStore() {
    setSelectedStore(null);
    setIsModalOpen(true);
  }

  function handleUploadClick(store: Store) {
    setSelectedStore(store);
    setIsModalOpen(true);
  }

  function handleCloseModal() {
    setIsModalOpen(false);
  }

  function handleUploadComplete() {
    refresh();          // refresh store card grid
    summaryRefetch();   // redraw DeadStockChart with updated data
  }

  return (
    <AppShell>
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl font-semibold text-[var(--color-text-primary)] tracking-[-0.01em]"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          Upload Stores
        </h1>
        <button
          type="button"
          onClick={handleAddStore}
          className="bg-[var(--color-teal)] text-white text-[13px] font-semibold rounded-md px-4 min-h-[44px] flex items-center gap-2 hover:bg-[var(--color-teal-dark)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-teal)] focus-visible:outline-offset-2"
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
          <span>Add Store</span>
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-[var(--color-teal)]" size={24} aria-label="Loading stores" />
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex justify-center py-12">
          <p className="text-[#EF4444] text-[13px]">{error}</p>  {/* semantic red — intentionally kept as-is */}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && stores.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">No stores yet</h2>
          <p className="text-[13px] text-[var(--color-text-muted)]">Add your first store to get started.</p>
          <button
            type="button"
            onClick={handleAddStore}
            className="mx-auto bg-[var(--color-teal)] text-white text-[13px] font-semibold rounded-md px-4 min-h-[44px] flex items-center gap-2 hover:bg-[var(--color-teal-dark)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-teal)] focus-visible:outline-offset-2"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
            <span>Add Store</span>
          </button>
        </div>
      )}

      {/* Store card grid */}
      {!loading && !error && stores.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {stores.map(store => (
            <StoreCard
              key={store.id}
              store={store}
              onUploadClick={handleUploadClick}
            />
          ))}
        </div>
      )}

      {/* Dead Stock Distribution Chart (D-09: always visible) */}
      <section className="mt-8">
        <h2
          className="text-base font-semibold text-[var(--color-text-primary)] mb-4"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          Dead Stock by Store
        </h2>
        {summaryLoading ? (
          <div className="min-h-[300px] flex items-center justify-center">
            <Loader2 className="animate-spin text-[var(--color-teal)]" size={24} aria-label="Loading chart data" />
          </div>
        ) : (summary?.stores ?? []).some(s => s.totalUnits > 0) ? (
          <DeadStockChart stores={summary?.stores ?? []} />
        ) : (
          <div className="min-h-[300px] flex flex-col items-center justify-center gap-3 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface-gray)] px-6 py-10">
            <p className="text-base font-semibold text-[var(--color-text-primary)]">
              No dead stock data yet
            </p>
            <p className="text-sm text-[var(--color-text-muted)] text-center max-w-xs">
              Upload dead stock files for each store to see the distribution here.
            </p>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="mt-1 text-sm font-semibold text-[var(--color-teal)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--color-teal)] focus-visible:outline-offset-2"
            >
              Upload files ↑
            </button>
          </div>
        )}
      </section>

      {/* Upload modal */}
      <UploadModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        store={selectedStore}
        onUploadComplete={handleUploadComplete}
      />
    </AppShell>
  );
}
