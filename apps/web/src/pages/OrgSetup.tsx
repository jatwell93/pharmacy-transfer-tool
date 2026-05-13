import { CreateOrganization } from '@clerk/react';

export default function OrgSetup() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface-gray)]">
      <div className="max-w-[400px] w-full p-8 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface)]">
        <h1
          className="font-semibold text-2xl text-[var(--color-text-primary)] tracking-[-0.01em] mb-3"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          Set up your pharmacy group
        </h1>
        <p
          className="text-base text-[var(--color-text-secondary)] mb-6"
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          You need a pharmacy group to use PharmIQ.
        </p>
        <CreateOrganization />
      </div>
    </div>
  );
}
