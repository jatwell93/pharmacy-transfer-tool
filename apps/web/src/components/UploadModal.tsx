import React, { useState, useEffect, useRef } from 'react';
import { X, Info, Loader2 } from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import { Store } from '../hooks/useStores';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: Store | null;  // null = new-store mode, non-null = existing-store mode
  onUploadComplete: () => void; // triggers useStores refresh
}

interface FieldErrors {
  rouFile?: string;
  dsFile?: string;
  general?: string;
}

export default function UploadModal({ isOpen, onClose, store, onUploadComplete }: UploadModalProps) {
  const fetchApi = useFetch();
  const [storeName, setStoreName] = useState('');
  const [storeNumber, setStoreNumber] = useState('');
  const [rouFile, setRouFile] = useState<File | null>(null);
  const [dsFile, setDsFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [uploadedCounts, setUploadedCounts] = useState<{ rouRows?: number; dsRows?: number } | null>(null);
  const [rouTooltipVisible, setRouTooltipVisible] = useState(false);
  const [dsTooltipVisible, setDsTooltipVisible] = useState(false);

  const storeNameRef = useRef<HTMLInputElement>(null);
  const rouFileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Sync store data into form fields when modal opens
  useEffect(() => {
    if (isOpen) {
      if (store) {
        setStoreName(store.name);
        setStoreNumber(store.storeNumber ?? '');
      } else {
        setStoreName('');
        setStoreNumber('');
      }
      setRouFile(null);
      setDsFile(null);
      setErrors({});
      setUploadedCounts(null);
    }
  }, [isOpen, store]);

  // Focus management on open
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      if (store) {
        // Existing store mode — focus ROU file input
        rouFileRef.current?.focus();
      } else {
        // New store mode — focus store name field
        storeNameRef.current?.focus();
      }
    }, 10);
    return () => clearTimeout(timer);
  }, [isOpen, store]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen || isUploading) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, isUploading, onClose]);

  // Focus trap
  useEffect(() => {
    if (!isOpen) return;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusableSelectors = [
        'button:not([disabled])',
        'input:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', ');
      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelectors)
      ).filter(el => !el.closest('[class*="pointer-events-none"]') && el.offsetParent !== null);

      if (focusableElements.length === 0) return;
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleTab);
    return () => window.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  if (!isOpen) return null;

  const isExistingStore = store !== null;
  const modalTitle = isExistingStore ? `Upload Files \u2014 ${store.name}` : 'Add Store';

  // Replace-confirmation warning logic
  const replacingRou = isExistingStore && rouFile !== null && store.rouUploadedAt !== null;
  const replacingDs = isExistingStore && dsFile !== null && store.dsUploadedAt !== null;

  let replaceWarning: string | null = null;
  if (replacingRou && replacingDs) {
    replaceWarning = `This will replace ${store.name}'s ROU and dead-stock data. Click Upload to continue or Escape to return.`;
  } else if (replacingRou) {
    replaceWarning = `This will replace ${store.name}'s ROU data. Click Upload to continue or Escape to return.`;
  } else if (replacingDs) {
    replaceWarning = `This will replace ${store.name}'s dead-stock data. Click Upload to continue or Escape to return.`;
  }

  // Upload button disabled logic
  const hasFiles = rouFile !== null || dsFile !== null;
  const hasStoreName = storeName.trim().length > 0;
  const isDisabled = isUploading || !hasFiles || (!isExistingStore && !hasStoreName);

  async function handleUpload() {
    setIsUploading(true);
    setErrors({});
    const formData = new FormData();
    formData.append('storeName', storeName);
    if (storeNumber) formData.append('storeNumber', storeNumber);
    if (rouFile) formData.append('rouFile', rouFile);
    if (dsFile) formData.append('dsFile', dsFile);

    try {
      const res = await fetchApi('/api/upload', {
        method: 'POST',
        body: formData,
        // Do NOT set Content-Type — browser sets multipart boundary automatically
      });
      if (res.status === 413) {
        const data = await res.json();
        setErrors(prev => ({ ...prev, [data.field || 'general']: data.error }));
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        const field = data.field as keyof FieldErrors | undefined;
        setErrors(field ? { [field]: data.error } : { general: data.error || 'Upload failed \u2014 check that this is a valid FRED Office export and try again.' });
        return;
      }
      const data = await res.json() as { rouRows?: number; dsRows?: number };
      setUploadedCounts({ rouRows: data.rouRows, dsRows: data.dsRows });
      onUploadComplete(); // triggers store list refresh
      // Modal stays open to show row counts — user closes manually
    } catch {
      setErrors({ general: 'Could not reach the server. Check your connection and try again.' });
    } finally {
      setIsUploading(false);
    }
  }

  const tooltipContent = 'Before exporting from FRED: filter by relevant departments/categories, filter for ROU > 0.01, filter for active items only, filter out $0 cost lines. Review in a spreadsheet (Excel, Google Sheets, or LibreOffice Calc) and delete unnecessary rows before upload.';

  const fieldClass = [
    'w-full border border-[var(--color-border-light)] rounded-md px-3 py-2 text-base text-[var(--color-text-primary)] outline-none',
    'focus:border-[var(--color-teal)] focus:ring-1 focus:ring-[var(--color-teal)]',
    isUploading ? 'pointer-events-none opacity-60' : '',
  ].join(' ');

  const fileInputClass = [
    'block w-full text-[13px] text-[var(--color-text-secondary)]',
    'file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0',
    'file:text-[13px] file:font-semibold file:bg-[var(--color-surface-gray)] file:text-[var(--color-text-primary)]',
    'hover:file:bg-[var(--color-border-light)] cursor-pointer',
    isUploading ? 'pointer-events-none opacity-60' : '',
  ].join(' ');

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(15, 23, 42, 0.6)' }}
      onClick={() => { if (!isUploading) onClose(); }}
      aria-hidden="false"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative bg-[var(--color-surface)] rounded-xl shadow-xl w-full max-w-md mx-4 p-6 flex flex-col gap-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Close X button */}
        <button
          type="button"
          onClick={() => { if (!isUploading) onClose(); }}
          disabled={isUploading}
          className="absolute top-4 right-4 flex items-center justify-center min-h-[44px] min-w-[44px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Close"
        >
          <X size={16} aria-hidden="true" />
        </button>

        {/* Title */}
        <h2
          id="modal-title"
          className="text-2xl font-semibold text-[var(--color-text-primary)] tracking-[-0.01em] pr-10"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          {modalTitle}
        </h2>

        {/* Form fields */}
        <div className="flex flex-col gap-4">
          {/* Store Name */}
          <div className="flex flex-col gap-1">
            <label htmlFor="store-name" className="text-[13px] font-semibold text-[var(--color-text-primary)]">
              Store Name <span className="text-[#EF4444]" aria-hidden="true">*</span>
            </label>
            <input
              ref={storeNameRef}
              id="store-name"
              type="text"
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
              readOnly={isExistingStore}
              required
              placeholder={isExistingStore ? undefined : 'e.g. Balwyn'}
              className={[fieldClass, isExistingStore ? 'bg-[var(--color-surface-gray)]' : 'bg-[var(--color-surface)]'].join(' ')}
            />
          </div>

          {/* Store Number */}
          <div className="flex flex-col gap-1">
            <label htmlFor="store-number" className="text-[13px] font-semibold text-[var(--color-text-primary)]">
              Store Number
            </label>
            <input
              id="store-number"
              type="text"
              value={storeNumber}
              onChange={e => setStoreNumber(e.target.value)}
              readOnly={isExistingStore}
              placeholder="Optional"
              className={[fieldClass, 'placeholder-[var(--color-text-muted)]', isExistingStore ? 'bg-[var(--color-surface-gray)]' : 'bg-[var(--color-surface)]'].join(' ')}
            />
          </div>

          {/* ROU file picker */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <label htmlFor="rou-file" className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                ROU Report
              </label>
              <div className="relative">
                <button
                  type="button"
                  className="flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] p-1"
                  aria-label="Help: ROU Report upload tips"
                  onMouseEnter={() => setRouTooltipVisible(true)}
                  onMouseLeave={() => setRouTooltipVisible(false)}
                  onFocus={() => setRouTooltipVisible(true)}
                  onBlur={() => setRouTooltipVisible(false)}
                >
                  <Info size={14} aria-hidden="true" />
                </button>
                {rouTooltipVisible && (
                  <div
                    role="tooltip"
                    className="absolute left-6 top-0 z-10 w-64 bg-[var(--color-navy)] text-white text-[13px] rounded-md px-3 py-2 shadow-lg"
                  >
                    {tooltipContent}
                  </div>
                )}
              </div>
            </div>
            <input
              ref={rouFileRef}
              id="rou-file"
              type="file"
              accept=".csv,.xlsx"
              onChange={e => setRouFile(e.target.files?.[0] ?? null)}
              disabled={isUploading}
              className={fileInputClass}
            />
            {errors.rouFile && (
              <p role="alert" className="text-[13px] text-[#EF4444]">{errors.rouFile}</p>
            )}
            {uploadedCounts?.rouRows !== undefined && (
              <p className="text-[13px] text-[var(--color-teal)]">✓ {uploadedCounts.rouRows.toLocaleString()} rows recognised</p>
            )}
          </div>

          {/* Dead-stock file picker */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <label htmlFor="ds-file" className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                Dead-Stock Report
              </label>
              <div className="relative">
                <button
                  type="button"
                  className="flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] p-1"
                  aria-label="Help: Dead-Stock Report upload tips"
                  onMouseEnter={() => setDsTooltipVisible(true)}
                  onMouseLeave={() => setDsTooltipVisible(false)}
                  onFocus={() => setDsTooltipVisible(true)}
                  onBlur={() => setDsTooltipVisible(false)}
                >
                  <Info size={14} aria-hidden="true" />
                </button>
                {dsTooltipVisible && (
                  <div
                    role="tooltip"
                    className="absolute left-6 top-0 z-10 w-64 bg-[var(--color-navy)] text-white text-[13px] rounded-md px-3 py-2 shadow-lg"
                  >
                    {tooltipContent}
                  </div>
                )}
              </div>
            </div>
            <input
              id="ds-file"
              type="file"
              accept=".csv,.xlsx"
              onChange={e => setDsFile(e.target.files?.[0] ?? null)}
              disabled={isUploading}
              className={fileInputClass}
            />
            {errors.dsFile && (
              <p role="alert" className="text-[13px] text-[#EF4444]">{errors.dsFile}</p>
            )}
            {uploadedCounts?.dsRows !== undefined && (
              <p className="text-[13px] text-[var(--color-teal)]">✓ {uploadedCounts.dsRows.toLocaleString()} rows recognised</p>
            )}
          </div>
        </div>

        {/* Replace-confirmation warning */}
        {replaceWarning && (
          <div className="border-l-4 border-[#D97706] bg-[#FEF3C7] px-4 py-3 text-[13px] text-[#92400E]">
            {replaceWarning}
          </div>
        )}

        {/* General error */}
        {errors.general && (
          <p role="alert" className="text-[13px] text-[#EF4444]">{errors.general}</p>
        )}

        {/* Buttons row */}
        <div className="flex justify-end gap-3">
          {uploadedCounts ? (
            <button
              type="button"
              onClick={onClose}
              className="bg-[var(--color-teal)] text-white text-[13px] font-semibold rounded-md px-4 min-h-[44px] hover:bg-[var(--color-teal-dark)] transition-colors cursor-pointer"
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { if (!isUploading) onClose(); }}
                disabled={isUploading}
                className="text-[13px] text-[var(--color-text-secondary)] min-h-[44px] px-4 hover:text-[var(--color-text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={isDisabled}
                className={[
                  'bg-[var(--color-teal)] text-white text-[13px] font-semibold rounded-md px-4 min-h-[44px] flex items-center gap-2',
                  isDisabled
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-[var(--color-teal-dark)] transition-colors cursor-pointer',
                ].join(' ')}
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                {isUploading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <span>Upload Files</span>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
