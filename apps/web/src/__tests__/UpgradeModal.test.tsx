import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import MatchPage from '../pages/MatchPage';

// Mock all hooks MatchPage depends on
vi.mock('../hooks/useMatchRun', () => ({
  useMatchRun: vi.fn(),
}));
vi.mock('../hooks/useUsage', () => ({
  useUsage: vi.fn(),
}));
vi.mock('../hooks/useFetch', () => ({
  useFetch: vi.fn(() => vi.fn()),
}));
vi.mock('../hooks/useStores', () => ({
  useStores: vi.fn(() => ({ stores: [], loading: false })),
}));
vi.mock('../hooks/useDeadStockSummary', () => ({
  useDeadStockSummary: vi.fn(() => ({ summary: null, loading: false })),
}));
vi.mock('../components/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/PostMatchChart', () => ({
  PostMatchChart: () => null,
}));
vi.mock('../components/CostReport', () => ({
  CostReport: () => null,
}));
vi.mock('@clerk/react', () => ({
  useOrganization: vi.fn(() => ({ organization: { name: 'Test Org' } })),
}));

import { useMatchRun } from '../hooks/useMatchRun';
import { useUsage } from '../hooks/useUsage';

const mockUseMatchRun = vi.mocked(useMatchRun);
const mockUseUsage = vi.mocked(useUsage);

// Default useUsage return — free plan at limit so modal can be triggered
const defaultUsageReturn = {
  usage: { count: 1, limit: 1, plan_tier: 'free' as const, store_count: 2 },
  loading: false,
  error: null,
  refresh: vi.fn(),
};

// Default useMatchRun return — no upgradeTo, no error
const defaultMatchRunReturn = {
  results: [],
  warnings: [],
  loading: false,
  error: null,
  hasRun: false,
  runMatch: vi.fn(),
  upgradeTo: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseUsage.mockReturnValue(defaultUsageReturn);
});

describe('UpgradeModal — tier-specific copy', () => {
  it('shows "Upgrade to Pro" title and $10/mo AUD body when upgradeTo is pro', () => {
    mockUseMatchRun.mockReturnValue({
      ...defaultMatchRunReturn,
      upgradeTo: 'pro',
      error: 'Monthly match run limit reached',
    });

    render(<MatchPage />);

    // Modal title should be "Upgrade to Pro"
    expect(screen.getByRole('heading', { name: 'Upgrade to Pro' })).toBeInTheDocument();

    // Modal body should mention $10/mo AUD
    expect(screen.getByText(/\$10\/mo AUD/)).toBeInTheDocument();
  });

  it('shows "Upgrade to Enterprise" title and $100/mo AUD body when upgradeTo is enterprise', () => {
    mockUseMatchRun.mockReturnValue({
      ...defaultMatchRunReturn,
      upgradeTo: 'enterprise',
      error: 'Store limit reached',
    });

    render(<MatchPage />);

    // Modal title should be "Upgrade to Enterprise"
    expect(screen.getByRole('heading', { name: 'Upgrade to Enterprise' })).toBeInTheDocument();

    // Modal body should mention $100/mo AUD
    expect(screen.getByText(/\$100\/mo AUD/)).toBeInTheDocument();
  });

  it('CTA button text differs by target tier', () => {
    // Test pro tier CTA
    mockUseMatchRun.mockReturnValue({
      ...defaultMatchRunReturn,
      upgradeTo: 'pro',
      error: 'limit reached',
    });

    const { rerender } = render(<MatchPage />);
    // The CTA button inside the modal (not the "Upgrade to run again" button in the control bar)
    const proButtons = screen.getAllByText('Upgrade to Pro');
    // At least one should be in the modal (as a button)
    expect(proButtons.some(el => el.tagName === 'BUTTON')).toBe(true);

    // Test enterprise tier CTA
    mockUseMatchRun.mockReturnValue({
      ...defaultMatchRunReturn,
      upgradeTo: 'enterprise',
      error: 'store limit reached',
    });

    rerender(<MatchPage />);
    const enterpriseButtons = screen.getAllByText('Upgrade to Enterprise');
    expect(enterpriseButtons.some(el => el.tagName === 'BUTTON')).toBe(true);

    // No "Upgrade to Pro" button when target is enterprise
    expect(screen.queryByText('Upgrade to Pro')).not.toBeInTheDocument();
  });

  it('modal has "Maybe later" dismiss button when open', () => {
    mockUseMatchRun.mockReturnValue({
      ...defaultMatchRunReturn,
      upgradeTo: 'pro',
      error: 'Monthly match run limit reached',
    });

    render(<MatchPage />);

    expect(screen.getByText('Maybe later')).toBeInTheDocument();
  });
});
