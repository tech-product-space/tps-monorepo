"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

import {
  CertificateAlign,
  CertificateField,
  certificateFontStack,
  nearestCertificateWeight,
  normalizeCertificateWeight,
} from "@/gradient/types/certificate";
import { FittedFields } from "./useFittedFontSizes";

/**
 * Tallest the stage may get before it starts scaling down. Without a cap a
 * portrait background renders a canvas a third taller than the viewport and the
 * admin drags a field they cannot see land.
 */
const STAGE_MAX_HEIGHT = 560;

/** How close to an axis a drag has to get before it locks onto it, in percent. */
const SNAP_TOLERANCE = 0.8;

/** Arrow-key nudge, and the finer step Shift asks for. */
const NUDGE = 0.5;
const FINE_NUDGE = 0.1;

/**
 * The server draws with `textBaseline: "middle"` and a horizontal origin set by
 * `textAlign`, so the box has to hang off the anchor exactly the same way.
 */
const ALIGN_TRANSFORM: Record<CertificateAlign, string> = {
  left: "translate(0, -50%)",
  center: "translate(-50%, -50%)",
  right: "translate(-100%, -50%)",
};

const clamp = (value: number) => Math.min(100, Math.max(0, value));
const round = (value: number) => Number(value.toFixed(2));

export type ZoomLevel = "fit" | number;

interface CertificateCanvasProps {
  backgroundUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  fields: CertificateField[];
  /** Sample text per placeholder — the same values the preview renders. */
  values: Record<string, string>;
  /**
   * Human label per placeholder. Passed in rather than imported: the catalogue
   * differs per kind of certificate, and this canvas is shared by all of them.
   */
  fieldLabels: Record<string, string>;
  fitted: FittedFields;
  selectedKey: string | null;
  zoom: ZoomLevel;
  onSelect: (key: string | null) => void;
  onMove: (key: string, position: { x: number; y: number }) => void;
  onDelete: (key: string) => void;
}

/**
 * The design surface: the background at its real aspect ratio with every
 * placeholder drawn in its own font, size, colour and weight.
 *
 * Labels on a chip would be easier, but then the only way to find out what a
 * certificate looks like is to render one — which is the round trip this screen
 * exists to remove.
 */
export default function CertificateCanvas({
  backgroundUrl,
  canvasWidth,
  canvasHeight,
  fields,
  values,
  fieldLabels,
  fitted,
  selectedKey,
  zoom,
  onSelect,
  onMove,
  onDelete,
}: CertificateCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    key: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const [viewportWidth, setViewportWidth] = useState(0);
  const [guides, setGuides] = useState({ x: false, y: false });

  // Only the width is observed. The stage's height follows from the scale, so
  // observing it too would feed the element's own output back into its input.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) =>
      setViewportWidth(entry.contentRect.width),
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fitScale = Math.min(
    viewportWidth / canvasWidth,
    STAGE_MAX_HEIGHT / canvasHeight,
  );

  // Before the first measurement there is no sane scale; render nothing rather
  // than a canvas that jumps size on the next frame.
  const scale = zoom === "fit" ? fitScale : zoom;
  const ready = viewportWidth > 0 && Number.isFinite(scale) && scale > 0;

  const displayWidth = canvasWidth * scale;
  const displayHeight = canvasHeight * scale;

  const pointerPercent = useCallback((event: React.PointerEvent) => {
    const rect = surfaceRef.current!.getBoundingClientRect();

    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    };
  }, []);

  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    field: CertificateField,
  ) => {
    event.preventDefault();
    onSelect(field.key);

    const pointer = pointerPercent(event);

    // Grab where the pointer actually landed. Without the offset the field
    // teleports so its anchor sits under the cursor the moment you touch it.
    dragRef.current = {
      key: field.key,
      offsetX: field.x - pointer.x,
      offsetY: field.y - pointer.y,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    const pointer = pointerPercent(event);

    let x = clamp(pointer.x + drag.offsetX);
    let y = clamp(pointer.y + drag.offsetY);

    // Centring by eye on a scaled-down canvas is guesswork, and off-centre is
    // the single most visible flaw on a printed certificate. Alt opts out.
    const snapX = !event.altKey && Math.abs(x - 50) < SNAP_TOLERANCE;
    const snapY = !event.altKey && Math.abs(y - 50) < SNAP_TOLERANCE;

    if (snapX) x = 50;
    if (snapY) y = 50;

    setGuides({ x: snapX, y: snapY });
    onMove(drag.key, { x: round(x), y: round(y) });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;

    dragRef.current = null;
    setGuides({ x: false, y: false });

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent,
    field: CertificateField,
  ) => {
    const step = event.shiftKey ? FINE_NUDGE : NUDGE;

    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };

    if (delta[event.key]) {
      event.preventDefault();
      const [dx, dy] = delta[event.key];
      onMove(field.key, {
        x: round(clamp(field.x + dx)),
        y: round(clamp(field.y + dy)),
      });
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onDelete(field.key);
      return;
    }

    if (event.key === "Escape") onSelect(null);
  };

  const selected = fields.find((field) => field.key === selectedKey) ?? null;

  return (
    <div
      ref={viewportRef}
      className="overflow-auto rounded-lg bg-muted/40 p-4"
      style={{ maxHeight: STAGE_MAX_HEIGHT + 32 }}
    >
      {ready && (
        <div
          ref={surfaceRef}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) onSelect(null);
          }}
          className="relative mx-auto select-none rounded-sm bg-white shadow-sm ring-1 ring-border"
          style={{ width: displayWidth, height: displayHeight }}
        >
          <Image
            src={backgroundUrl}
            alt="Certificate background"
            fill
            unoptimized
            sizes="100vw"
            className="pointer-events-none rounded-sm object-contain"
          />

          {/* Centre guides, drawn only while a drag is locked onto one. */}
          {guides.x && (
            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-sky-500" />
          )}
          {guides.y && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-sky-500" />
          )}

          {/* The width the render shrinks text to fit. Shown for the selected
              field only — it is the invisible constraint behind every
              "why did my font size change" question. */}
          {selected?.maxWidth ? (
            <div
              className="pointer-events-none absolute border border-dashed border-sky-500/60"
              style={{
                left: `${selected.x}%`,
                top: `${selected.y}%`,
                width: `${selected.maxWidth}%`,
                height: (fitted[selected.key]?.size ?? selected.fontSize) * scale * 1.5,
                transform: ALIGN_TRANSFORM[selected.align ?? "center"],
              }}
            />
          ) : null}

          {fields.map((field) => {
            const isSelected = selectedKey === field.key;
            const fit = fitted[field.key];
            const align = field.align ?? "center";

            return (
              <div
                key={field.key}
                role="button"
                tabIndex={0}
                aria-label={fieldLabels[field.key]}
                onPointerDown={(event) => handlePointerDown(event, field)}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(event) => handleKeyDown(event, field)}
                className={`absolute cursor-move whitespace-nowrap ${
                  isSelected
                    ? ""
                    : "hover:[outline:1px_dashed_var(--muted-foreground)]"
                }`}
                style={{
                  left: `${field.x}%`,
                  top: `${field.y}%`,
                  transform: ALIGN_TRANSFORM[align],
                  // Written out rather than a utility class so the box is
                  // exactly 1px whatever the stage is zoomed to — a scaled
                  // selection border reads as part of the artwork.
                  outline: isSelected ? "1px solid var(--primary)" : undefined,
                  // Canvas pixels scaled to whatever the stage is showing, so
                  // this line is the same fraction of the page as in the PDF.
                  fontSize: (fit?.size ?? field.fontSize) * scale,
                  fontFamily: certificateFontStack(field.fontFamily),
                  fontWeight:
                    fit?.weight ??
                    nearestCertificateWeight(
                      field.fontFamily,
                      normalizeCertificateWeight(field.fontWeight),
                    ),
                  color: field.color,
                  lineHeight: 1,
                  textAlign: align,
                }}
              >
                {values[field.key]}

                {isSelected && (
                  <span className="absolute bottom-full left-0 mb-1 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 font-sans text-[10px] font-medium leading-none text-primary-foreground">
                    {fieldLabels[field.key]}
                    {fit?.shrunk ? ` · shrunk to ${fit.size}px` : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
