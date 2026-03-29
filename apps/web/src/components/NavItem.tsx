import React from 'react';
import { Link } from 'react-router';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  disabled: boolean;
  href?: string;
}

export default function NavItem({ icon, label, disabled, href = '#' }: NavItemProps) {
  const className = [
    'flex items-center gap-1 min-h-[44px] py-2 px-4',
    'text-[13px] text-[#475569]',
    disabled
      ? 'opacity-40 cursor-not-allowed pointer-events-none'
      : 'hover:text-[#0F766E] cursor-pointer',
  ].join(' ');

  const style = { fontFamily: "'Inter', system-ui, sans-serif" };

  const content = (
    <>
      <span aria-hidden="true" className="w-4 h-4 flex-shrink-0">{icon}</span>
      <span>{label}</span>
    </>
  );

  if (disabled) {
    return (
      <a
        aria-disabled="true"
        title="Coming soon"
        className={className}
        style={style}
      >
        {content}
      </a>
    );
  }

  return (
    <Link to={href} className={className} style={style}>
      {content}
    </Link>
  );
}
