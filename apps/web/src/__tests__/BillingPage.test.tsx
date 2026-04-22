import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import BillingPage from '../pages/BillingPage';

// Mock hooks
vi.mock('../hooks/useUsage', () => ({
  useUsage: vi.fn(),
}));
vi.mock('../hooks/useFetch', () => ({
  useFetch: vi.fn(() => vi.fn()),
}));
vi.mock('../components/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { useUsage } from '../hooks/useUsage';
const mockUseUsage = vi.mocked(useUsage);

const defaultUsageReturn = {
  usage: null,
  loading: false,
  error: null,
  refresh: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset window.location.search to empty (no checkout param)
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search: '' },
    writable: true,
  });
});

describe('BillingPage', () => {
  it('renders 3 pricing cards — Free, Pro, and Enterprise', () => {
    mockUseUsage.mockReturnValue({
      ...defaultUsageReturn,
      usage: { count: 0, limit: 1, plan_tier: 'free', store_count: 2 },
    });

    render(<BillingPage />);

    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('Enterprise')).toBeInTheDocument();
  });

  it('current plan card shows "Current plan" badge and correct upgrade buttons', () => {
    mockUseUsage.mockReturnValue({
      ...defaultUsageReturn,
      usage: { count: 3, limit: 10, plan_tier: 'pro', store_count: 5 },
    });

    render(<BillingPage />);

    // Current plan badge exists
    expect(screen.getByText('Current plan')).toBeInTheDocument();

    // Upgrade to Enterprise button exists (next tier up)
    expect(screen.getByText('Upgrade to Enterprise')).toBeInTheDocument();

    // Upgrade to Pro button does NOT exist (that's the current plan)
    expect(screen.queryByText('Upgrade to Pro')).not.toBeInTheDocument();
  });

  it('"Manage subscription" link hidden for free users', () => {
    mockUseUsage.mockReturnValue({
      ...defaultUsageReturn,
      usage: { count: 0, limit: 1, plan_tier: 'free', store_count: 1 },
    });

    const { rerender } = render(<BillingPage />);

    // Hidden for free users
    expect(screen.queryByText('Manage subscription')).not.toBeInTheDocument();

    // Visible for pro users
    mockUseUsage.mockReturnValue({
      ...defaultUsageReturn,
      usage: { count: 3, limit: 10, plan_tier: 'pro', store_count: 5 },
    });
    rerender(<BillingPage />);
    expect(screen.getByText('Manage subscription')).toBeInTheDocument();
  });

  it('usage row shows match runs and store counts', () => {
    mockUseUsage.mockReturnValue({
      ...defaultUsageReturn,
      usage: { count: 3, limit: 10, plan_tier: 'pro', store_count: 7 },
    });

    render(<BillingPage />);

    expect(screen.getByText(/Match runs: 3\/10 this month/)).toBeInTheDocument();
    expect(screen.getByText(/Stores: 7\/10/)).toBeInTheDocument();
  });

  it('enterprise shows infinity symbol for match runs and stores', () => {
    mockUseUsage.mockReturnValue({
      ...defaultUsageReturn,
      usage: { count: 5, limit: -1, plan_tier: 'enterprise', store_count: 15 },
    });

    render(<BillingPage />);

    // Infinity symbol ∞ (U+221E) should appear
    const infinityChar = '\u221E';
    const matchRunsText = screen.getByText(new RegExp(`Match runs: 5/${infinityChar} this month`));
    expect(matchRunsText).toBeInTheDocument();

    const storesText = screen.getByText(new RegExp(`Stores: 15/${infinityChar}`));
    expect(storesText).toBeInTheDocument();
  });
});
