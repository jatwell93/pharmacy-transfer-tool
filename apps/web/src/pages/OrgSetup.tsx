import { CreateOrganization } from '@clerk/react';

export default function OrgSetup() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <div className="max-w-[400px] w-full p-8 rounded-lg border border-[#E2E8F0] bg-white">
        <h1
          className="font-semibold text-2xl text-[#0F172A] tracking-[-0.01em] mb-3"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          Set up your pharmacy group
        </h1>
        <p
          className="text-base text-[#475569] mb-6"
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          You need a pharmacy group to use Dead-Stock Optimizer.
        </p>
        <CreateOrganization />
      </div>
    </div>
  );
}
