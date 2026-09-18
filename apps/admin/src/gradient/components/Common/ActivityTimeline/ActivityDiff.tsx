"use client";

import { formatChangeValue, formatFieldPath } from "@/gradient/constants/activity";
import type { ActivityChange, ActivityChanges } from "@/gradient/types/activity";

interface Props {
  changes: ActivityChanges;
  metadata?: Record<string, unknown>;
}

const isChangePair = (value: ActivityChange | string): value is ActivityChange =>
  typeof value === "object" && value !== null;

/**
 * Renders a stored diff as "field: from → to".
 *
 * Two stored values need explaining rather than displaying raw:
 *  - `_truncated` — the diff was too large to store whole. Shown as a note, so a
 *    partial diff is never mistaken for a complete one.
 *  - "[redacted]" — the field changed but the values are never persisted.
 */
const ActivityDiff = ({ changes, metadata }: Props) => {
  const entries = Object.entries(changes || {}).filter(
    ([field]) => field !== "_truncated",
  );

  const truncated = changes?._truncated;
  const metaEntries = Object.entries(metadata || {}).filter(
    ([key]) => !["params", "unmappedRoute", "multipart", "failed"].includes(key),
  );

  if (entries.length === 0 && metaEntries.length === 0 && !truncated) {
    return (
      <p className="text-sm text-gray-500">
        No field-level detail was recorded for this action.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.length > 0 && (
        <div className="space-y-1.5">
          {entries.map(([field, value]) => (
            <div
              key={field}
              className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-3"
            >
              <span className="font-medium text-gray-700">
                {formatFieldPath(field)}
              </span>

              {isChangePair(value) ? (
                <span className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="max-w-full truncate rounded bg-red-50 px-1.5 py-0.5 font-mono text-xs text-red-700">
                    {formatChangeValue(value.from)}
                  </span>
                  <span className="text-gray-400">→</span>
                  <span className="max-w-full truncate rounded bg-green-50 px-1.5 py-0.5 font-mono text-xs text-green-700">
                    {formatChangeValue(value.to)}
                  </span>
                </span>
              ) : (
                <span className="font-mono text-xs text-gray-500">{value}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {metaEntries.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-xs text-gray-600">
          {metaEntries.map(([key, value]) => (
            <span key={key}>
              <span className="font-medium">{formatFieldPath(key)}:</span>{" "}
              {formatChangeValue(value)}
            </span>
          ))}
        </div>
      )}

      {truncated && (
        <p className="text-xs text-amber-700">
          Partial record — {String(truncated)}.
        </p>
      )}
    </div>
  );
};

export default ActivityDiff;
