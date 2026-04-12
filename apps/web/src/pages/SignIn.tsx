import { SignIn as ClerkSignIn } from '@clerk/react';

export default function SignIn() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface-gray)]">
      <div className="max-w-[400px] w-full p-8 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface)]">
        <h1
          className="font-semibold text-2xl text-[var(--color-text-primary)] tracking-[-0.01em] mb-1"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          Sign in to PharmIQ
        </h1>
        <p
          className="text-base text-[var(--color-text-secondary)] mb-6"
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          Dead-Stock Optimizer
        </p>
        <ClerkSignIn
          routing="path"
          path="/sign-in"
          fallbackRedirectUrl="/"
          appearance={{
            variables: {
              colorPrimary: '#0F766E',
              colorText: '#0F172A',
              colorBackground: '#FFFFFF',
              fontFamily: 'Inter, system-ui, sans-serif',
            },
          }}
        />
      </div>
    </div>
  );
}
