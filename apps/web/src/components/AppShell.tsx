import React from 'react';
import { UserButton, SignOutButton } from '@clerk/react';
import { Upload, GitCompare, CreditCard, Settings, LogOut } from 'lucide-react';
import NavItem from './NavItem';

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="h-14 bg-[#0F766E] flex items-center justify-between px-6 flex-shrink-0">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-white focus:text-[#0F766E] focus:px-3 focus:py-1 focus:rounded focus:z-50">
          Skip to main content
        </a>
        <span
          className="font-semibold text-[32px] text-white leading-[1.2] tracking-[-0.01em]"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          PharmIQ
        </span>
        <UserButton />
      </header>

      {/* Body: sidebar + main */}
      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-60 flex-shrink-0 bg-[#F8FAFC] border-r border-[#E2E8F0] flex flex-col">
          <nav aria-label="Main navigation" className="flex-1 py-4">
            <NavItem
              icon={<Upload size={16} strokeWidth={1.5} aria-hidden="true" />}
              label="Upload"
              disabled={false}
              href="/upload"
            />
            <NavItem
              icon={<GitCompare size={16} strokeWidth={1.5} aria-hidden="true" />}
              label="Match"
              disabled={false}
              href="/match"
            />
            <NavItem
              icon={<CreditCard size={16} strokeWidth={1.5} aria-hidden="true" />}
              label="Billing"
              disabled={true}
            />
          </nav>

          {/* Sidebar footer */}
          <div className="border-t border-[#E2E8F0] py-4">
            <NavItem
              icon={<Settings size={16} strokeWidth={1.5} aria-hidden="true" />}
              label="Settings"
              disabled={true}
            />
            <SignOutButton>
              <button
                className="flex items-center gap-1 min-h-[44px] py-2 px-4 w-full text-[13px] text-[#475569] cursor-pointer hover:text-[#0F172A]"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                <LogOut size={16} strokeWidth={1.5} aria-hidden="true" />
                <span>Sign out</span>
              </button>
            </SignOutButton>
          </div>
        </aside>

        {/* Main content */}
        <main id="main-content" className="flex-1 p-8 bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}
