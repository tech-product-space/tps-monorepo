import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Check, X } from 'lucide-react';
import { cn } from '@/crm/lib/utils';
import {
  DASHBOARD_PRESET_GROUPS,
  PRESET_LABELS,
  buildPreset,
  buildCustom,
  parseDateInput,
  toDateInput,
  formatSpan,
} from '@/crm/lib/dateRange';
import type { DateRange, PresetGroup, PresetKey } from '@/crm/lib/dateRange';

interface DateRangePickerProps {
  value: DateRange | null;
  onChange: (r: DateRange | null) => void;
  /** Which presets to offer, and how to cluster them. */
  groups?: PresetGroup[];
  /**
   * Allow ranges that extend past today. False on reporting surfaces, where a
   * future date can only ever return nothing; true on the Meetings page, where
   * upcoming calls are most of the point.
   */
  allowFuture?: boolean;
  /** Offer an "any date" escape hatch. For filters where a range is optional. */
  clearable?: boolean;
  clearLabel?: string;
  /** Trigger label when value is null. */
  placeholder?: string;
}

export function DateRangePicker({
  value,
  onChange,
  groups = DASHBOARD_PRESET_GROUPS,
  allowFuture = false,
  clearable = false,
  clearLabel = 'Any date',
  placeholder = 'Any date',
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(value?.key === 'custom');
  const [fromDraft, setFromDraft] = useState(value ? toDateInput(value.from) : '');
  const [toDraft, setToDraft] = useState(value ? toDateInput(value.to) : '');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click — same behaviour as AgentFilter.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reset the drafts to the active range each time the panel opens.
  useEffect(() => {
    if (isOpen) {
      setShowCustom(value?.key === 'custom');
      setFromDraft(value ? toDateInput(value.from) : '');
      setToDraft(value ? toDateInput(value.to) : '');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const pickPreset = (key: PresetKey) => {
    onChange(buildPreset(key, allowFuture));
    setIsOpen(false);
  };

  const applyCustom = () => {
    const from = parseDateInput(fromDraft);
    const to = parseDateInput(toDraft);
    if (!from || !to) {
      setError('Pick both a start and end date.');
      return;
    }
    // Guard against ranges that can only return nothing — but only where the
    // future genuinely holds nothing. Meetings are booked ahead.
    if (!allowFuture && from > new Date()) {
      setError('Start date is in the future.');
      return;
    }
    onChange(buildCustom(from, to));
    setIsOpen(false);
  };

  const maxInput = allowFuture ? undefined : toDateInput(new Date());

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
        className={cn(
          'flex items-center gap-2 h-9 px-3.5 rounded-full border text-xs font-semibold transition-all duration-200',
          'bg-white shadow-sm',
          isOpen
            ? 'border-indigo-400 text-indigo-700 shadow-indigo-100'
            : value
              ? 'border-slate-300 text-slate-700 hover:border-slate-400'
              : 'border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-800',
        )}
      >
        <Calendar
          className={cn('w-3.5 h-3.5 shrink-0', isOpen ? 'text-indigo-500' : 'text-slate-400')}
        />
        <span>{value ? value.label : placeholder}</span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-slate-400 transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute top-full mt-2 left-0 z-50 w-64',
            'bg-white rounded-2xl border border-slate-200',
            'shadow-xl shadow-slate-200/60',
          )}
        >
          <div className="px-4 py-3 border-b border-slate-100">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Date range
            </span>
          </div>

          <ul className="py-1.5 max-h-80 overflow-y-auto">
            {clearable && (
              <li>
                <button
                  onClick={() => {
                    onChange(null);
                    setIsOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-4 py-2 text-left transition-colors',
                    !value ? 'bg-indigo-50/60 text-indigo-800' : 'hover:bg-slate-50 text-slate-700',
                  )}
                >
                  <span className="text-xs font-medium">{clearLabel}</span>
                  {!value && <Check className="w-3.5 h-3.5 text-indigo-500" strokeWidth={3} />}
                </button>
              </li>
            )}

            {/* Custom sits at the top, above the presets. The panel opens
                directly beneath its own toggle so the inputs appear where you
                clicked, rather than the toggle living up here and the fields
                landing at the far end of the menu. */}
            <li className={cn(clearable && 'border-t border-slate-100 pt-1 mt-1')}>
              <button
                onClick={() => setShowCustom((s) => !s)}
                aria-expanded={showCustom}
                className={cn(
                  'w-full flex items-center justify-between gap-3 px-4 py-2 text-left transition-colors',
                  value?.key === 'custom'
                    ? 'bg-indigo-50/60 text-indigo-800'
                    : 'hover:bg-slate-50 text-slate-700',
                )}
              >
                <span className="text-xs font-medium">Custom range</span>
                {value?.key === 'custom' && !showCustom ? (
                  <Check className="w-3.5 h-3.5 text-indigo-500" strokeWidth={3} />
                ) : (
                  <ChevronDown
                    className={cn(
                      'w-3.5 h-3.5 text-slate-400 transition-transform',
                      showCustom && 'rotate-180',
                    )}
                  />
                )}
              </button>
            </li>

            {showCustom && (
              <li className="px-4 pt-1 pb-3 space-y-2.5">
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    From
                  </span>
                  <input
                    type="date"
                    value={fromDraft}
                    max={maxInput}
                    onChange={(e) => {
                      setFromDraft(e.target.value);
                      setError(null);
                    }}
                    className="mt-1 w-full h-8.5 px-2.5 rounded-xl border border-slate-300 bg-slate-50/60 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 focus:bg-white transition-colors"
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    To
                  </span>
                  <input
                    type="date"
                    value={toDraft}
                    max={maxInput}
                    onChange={(e) => {
                      setToDraft(e.target.value);
                      setError(null);
                    }}
                    className="mt-1 w-full h-8.5 px-2.5 rounded-xl border border-slate-300 bg-slate-50/60 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 focus:bg-white transition-colors"
                  />
                </label>

                {error && <p className="text-[11px] font-medium text-rose-500">{error}</p>}

                {!error && fromDraft && toDraft && (
                  <p className="text-[10px] font-medium text-slate-400">
                    {(() => {
                      const f = parseDateInput(fromDraft);
                      const t = parseDateInput(toDraft);
                      return f && t ? formatSpan(f < t ? f : t, f < t ? t : f) : null;
                    })()}
                  </p>
                )}

                <button
                  onClick={applyCustom}
                  className="w-full h-8.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
                >
                  Apply
                </button>
              </li>
            )}

            <li aria-hidden="true" className="border-t border-slate-100 my-1" />

            {groups.map((group, gi) => (
              <li key={group.label ?? `g${gi}`}>
                {group.label && (
                  <div
                    className={cn(
                      'px-4 pt-2.5 pb-1 text-[9px] font-bold uppercase tracking-widest text-slate-400',
                      gi > 0 && 'border-t border-slate-100 mt-1',
                    )}
                  >
                    {group.label}
                  </div>
                )}
                <ul>
                  {group.keys.map((key) => {
                    const active = value?.key === key;
                    return (
                      <li key={key}>
                        <button
                          onClick={() => pickPreset(key)}
                          className={cn(
                            'w-full flex items-center justify-between gap-3 px-4 py-2 text-left transition-colors',
                            active
                              ? 'bg-indigo-50/60 text-indigo-800'
                              : 'hover:bg-slate-50 text-slate-700',
                          )}
                        >
                          <span className="text-xs font-medium">{PRESET_LABELS[key]}</span>
                          {active && (
                            <Check className="w-3.5 h-3.5 text-indigo-500" strokeWidth={3} />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>

          {clearable && value && (
            <button
              onClick={() => {
                onChange(null);
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-slate-100 text-[11px] font-bold text-slate-400 hover:text-rose-600 transition-colors"
            >
              <X className="w-3 h-3" />
              Clear date filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}
