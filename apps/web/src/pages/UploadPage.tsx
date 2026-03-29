import React, { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import AppShell from '../components/AppShell';
import StoreCard from '../components/StoreCard';
import UploadModal from '../components/UploadModal';
import { useStores, Store } from '../hooks/useStores';

export default function UploadPage() {
  const { stores, loading, error, refresh } = useStores();
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

  return (
    <AppShell>
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl font-semibold text-[#0F172A] tracking-[-0.01em]"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          Upload Stores
        </h1>
        <button
          type="button"
          onClick={handleAddStore}
          className="bg-[#0F766E] text-white text-[13px] font-semibold rounded-md px-4 min-h-[44px] flex items-center gap-2 hover:bg-[#0D5D5A] transition-colors focus-visible:outline-2 focus-visible:outline-[#0F766E] focus-visible:outline-offset-2"
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
          <span>Add Store</span>
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-[#0F766E]" size={24} aria-label="Loading stores" />
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex justify-center py-12">
          <p className="text-[#EF4444] text-[13px]">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && stores.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <h2 className="text-base font-semibold text-[#0F172A]">No stores yet</h2>
          <p className="text-[13px] text-[#94A3B8]">Add your first store to get started.</p>
          <button
            type="button"
            onClick={handleAddStore}
            className="mx-auto bg-[#0F766E] text-white text-[13px] font-semibold rounded-md px-4 min-h-[44px] flex items-center gap-2 hover:bg-[#0D5D5A] transition-colors focus-visible:outline-2 focus-visible:outline-[#0F766E] focus-visible:outline-offset-2"
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

      {/* Upload modal */}
      <UploadModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        store={selectedStore}
        onUploadComplete={refresh}
      />
    </AppShell>
  );
}
