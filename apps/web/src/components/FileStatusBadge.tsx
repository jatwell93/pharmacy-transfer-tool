import React from 'react';

interface FileStatusBadgeProps {
  label: string;       // "ROU" or "Dead"
  uploadedAt: string | null;
}

export default function FileStatusBadge({ label, uploadedAt }: FileStatusBadgeProps) {
  const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    const datePart = date.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const timePart = date.toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${datePart}, ${timePart}`;
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] text-[#0F172A] font-semibold">{label}:</span>
      {uploadedAt ? (
        <>
          <span className="w-2 h-2 bg-[#10B981] rounded-full flex-shrink-0" aria-hidden="true" />
          <span className="text-[13px] text-[#475569]">{formatDate(uploadedAt)}</span>
        </>
      ) : (
        <span className="text-[13px] text-[#94A3B8]">&#8211; not uploaded</span>
      )}
    </div>
  );
}
