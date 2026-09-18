import type { ReactNode } from 'react';
import { cn } from '@/crm/lib/utils';

interface CardProps {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  className?: string;
  /** Extra classes for the body — e.g. `flex-1 min-h-0 overflow-y-auto` to make
   *  the content scroll inside a fixed-height card. */
  bodyClassName?: string;
  children: ReactNode;
}

// Shared white panel matching the CRM's rounded-2xl / slate-border look.
// The header is shrink-0 so a `h-full flex flex-col` card can hand all
// remaining height to the body.
export function Card({
  title,
  subtitle,
  right,
  className,
  bodyClassName,
  children,
}: CardProps) {
  return (
    <section
      className={cn(
        'bg-white rounded-2xl border border-slate-300 shadow-sm shadow-slate-200/50',
        className,
      )}
    >
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 shrink-0">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold text-slate-900 tracking-tight">{title}</h2>
            )}
            {subtitle && (
              <p className="text-[11px] font-medium text-slate-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className={cn('px-5 pb-5', bodyClassName)}>{children}</div>
    </section>
  );
}

// Lightweight loading / empty / error states used across widgets.
export function WidgetState({
  status,
  error,
  empty,
  emptyLabel = 'No data for this period',
}: {
  status: 'loading' | 'error' | 'empty';
  error?: string;
  empty?: boolean;
  emptyLabel?: string;
}) {
  if (status === 'loading') {
    return (
      <div className="h-40 flex items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin" />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="h-40 flex items-center justify-center text-center px-4">
        <p className="text-xs font-semibold text-rose-500">{error || 'Failed to load'}</p>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="h-40 flex items-center justify-center">
        <p className="text-xs font-medium text-slate-500">{emptyLabel}</p>
      </div>
    );
  }
  return null;
}
