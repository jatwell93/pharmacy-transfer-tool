import { SignIn as ClerkSignIn } from '@clerk/react';

export default function SignIn() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <div className="max-w-[400px] w-full p-8 rounded-lg border border-[#E2E8F0] bg-white">
        <h1
          className="font-semibold text-2xl text-[#0F172A] tracking-[-0.01em] mb-1"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          Sign in to PharmIQ
        </h1>
        <p
          className="text-base text-[#475569] mb-6"
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
