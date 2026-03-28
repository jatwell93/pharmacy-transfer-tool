import React from 'react';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  disabled: boolean;
  href?: string;
}

export default function NavItem({ icon, label, disabled, href = '#' }: NavItemProps) {
  return (
    <a
      href={disabled ? undefined : href}
      aria-disabled={disabled ? 'true' : undefined}
      title={disabled ? 'Coming soon' : undefined}
      className={[
        'flex items-center gap-1 min-h-[44px] py-2 px-4',
        'text-[13px] text-[#475569]',
        disabled
          ? 'opacity-40 cursor-not-allowed pointer-events-none'
          : 'hover:text-[#0F766E] cursor-pointer',
      ].join(' ')}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <span aria-hidden="true" className="w-4 h-4 flex-shrink-0">{icon}</span>
      <span>{label}</span>
    </a>
  );
}
