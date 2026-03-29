import React from 'react';
import { Store } from '../hooks/useStores';
import FileStatusBadge from './FileStatusBadge';

interface StoreCardProps {
  store: Store;
  onUploadClick: (store: Store) => void;
}

export default function StoreCard({ store, onUploadClick }: StoreCardProps) {
  // Incomplete indicator: visible ONLY when exactly one of rouUploadedAt/dsUploadedAt is non-null
  const isIncomplete =
    (store.rouUploadedAt !== null) !== (store.dsUploadedAt !== null);

  const displayName = store.storeNumber
    ? `${store.name} (${store.storeNumber})`
    : store.name;

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 flex flex-col gap-3">
      <div>
        <h2
          className="text-base font-semibold text-[#0F172A]"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          {displayName}
        </h2>
      </div>

      {isIncomplete && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#D97706] flex-shrink-0" aria-hidden="true" />
          <span className="text-[13px] text-[#D97706]">Missing files</span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <FileStatusBadge label="ROU" uploadedAt={store.rouUploadedAt} />
        <FileStatusBadge label="Dead" uploadedAt={store.dsUploadedAt} />
      </div>

      <button
        type="button"
        onClick={() => onUploadClick(store)}
        className="mt-auto text-[13px] text-[#0F766E] font-semibold min-h-[44px] px-3 hover:underline cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-[#0F766E] focus-visible:outline-offset-2"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        Upload files
      </button>
    </div>
  );
}
