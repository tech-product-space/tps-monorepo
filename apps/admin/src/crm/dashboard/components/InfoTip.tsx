import { Info } from 'lucide-react';
import { cn } from '@/crm/lib/utils';

// Small "i" affordance that reveals an explanation on hover or keyboard focus.
// Pure CSS (group-hover / group-focus-within) — no popover library needed.
export function InfoTip({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn('relative inline-flex group shrink-0', className)}>
      <button
        type="button"
        aria-label={text}
        className="w-4 h-4 rounded-full flex items-center justify-center text-slate-300 hover:text-indigo-500 focus:text-indigo-500 focus:outline-none transition-colors"
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 right-0 top-full mt-1.5 w-56',
          'rounded-xl bg-slate-900 px-3 py-2 text-left',
          'text-[11px] font-medium leading-relaxed text-slate-100',
          'shadow-lg shadow-slate-900/20',
          'opacity-0 -translate-y-1 transition-all duration-150',
          'group-hover:opacity-100 group-hover:translate-y-0',
          'group-focus-within:opacity-100 group-focus-within:translate-y-0',
        )}
      >
        {text}
      </span>
    </span>
  );
}
