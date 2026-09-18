"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Eye,
  Loader2,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import { resolveStorageUrl } from "@/gradient/lib/storage";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { uploadFile } from "@/gradient/services/fileUpload";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/gradient/components/ui/dropdown-menu";
import {
  CERTIFICATE_DEFAULT_FONT_FAMILY,
  CERTIFICATE_FONTS,
  CERTIFICATE_PAGE_WIDTH_PT,
  CERTIFICATE_SYSTEM_FONT_VALUE,
  CERTIFICATE_WEIGHT_LABELS,
  CertificateDomain,
  CertificateField,
  CertificateFontWeight,
  CertificateOrientation,
  CertificateTemplatePayload,
  certificateFontDefinition,
  inferOrientation,
  nearestCertificateWeight,
  normalizeCertificateWeight,
  PT_TO_MM,
} from "@/gradient/types/certificate";
import CertificateCanvas, { ZoomLevel } from "./CertificateCanvas";
import CertificatePreviewDialog from "./CertificatePreviewDialog";
import { useFittedFontSizes } from "./useFittedFontSizes";

const MAX_BACKGROUND_MB = 5;

const ZOOM_OPTIONS: { value: string; label: string }[] = [
  { value: "fit", label: "Fit" },
  { value: "0.5", label: "50%" },
  { value: "0.75", label: "75%" },
  { value: "1", label: "100%" },
  { value: "1.5", label: "150%" },
];

const ORIENTATIONS: {
  value: CertificateOrientation;
  label: string;
  Icon: typeof RectangleHorizontal;
}[] = [
  { value: "landscape", label: "Landscape", Icon: RectangleHorizontal },
  { value: "portrait", label: "Portrait", Icon: RectangleVertical },
];

interface CertificateEditorProps {
  /** The event or course this design belongs to. */
  subjectId: string;
  /**
   * Everything that differs between kinds of certificate: the placeholder
   * catalogue, their labels and sample values, where backgrounds upload to, and
   * how to load, save and preview.
   *
   * Passing this rather than branching inside is what keeps one editor honest —
   * a new kind of certificate is a new config, not a new `if`.
   */
  domain: CertificateDomain;
}

/**
 * The certificate design surface, shared by events and free courses.
 *
 * Upload a background, drop placeholders onto it, position them by dragging.
 * Positions are percentages of the canvas, never pixels, which is what lets an
 * admin work on a scaled preview and still match the server render exactly.
 */
export default function CertificateEditor({
  subjectId,
  domain,
}: CertificateEditorProps) {
  const { fieldLabels, fieldDefaults, service } = domain;
  const [name, setName] = useState("Certificate of Participation");
  const [backgroundKey, setBackgroundKey] = useState("");
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [canvasHeight, setCanvasHeight] = useState(0);
  const [orientation, setOrientation] =
    useState<CertificateOrientation>("landscape");
  const [fields, setFields] = useState<CertificateField[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ZoomLevel>("fit");

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  // What the server currently holds, so the header can say whether there is
  // anything worth saving. A design editor with no dirty marker is one tab
  // switch away from losing an afternoon.
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);

  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    service
      .getTemplate(subjectId)
      .then((template) => {
        if (!template) return;

        setName(template.name);
        setBackgroundKey(template.backgroundKey);
        setCanvasWidth(template.canvasWidth);
        setCanvasHeight(template.canvasHeight);
        setOrientation(
          template.orientation ??
            inferOrientation(template.canvasWidth, template.canvasHeight),
        );
        setFields(template.fields);
        setSavedSnapshot(
          JSON.stringify({
            name: template.name,
            backgroundKey: template.backgroundKey,
            canvasWidth: template.canvasWidth,
            canvasHeight: template.canvasHeight,
            orientation:
              template.orientation ??
              inferOrientation(template.canvasWidth, template.canvasHeight),
            fields: template.fields,
          }),
        );
      })
      .catch((error) =>
        toast.error(getApiErrorMessage(error, "Could not load the template")),
      )
      .finally(() => setLoading(false));
  }, [subjectId, service]);

  // Object URLs outlive the component unless revoked, and a preview is a whole
  // PDF held in memory.
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  const handleUpload = async (file: File) => {
    if (file.size > MAX_BACKGROUND_MB * 1024 * 1024) {
      toast.error(`Background must be under ${MAX_BACKGROUND_MB}MB`);
      return;
    }

    setUploading(true);

    try {
      // Natural dimensions define the coordinate space every field position is
      // a percentage of, so they have to come from the image itself.
      const objectUrl = URL.createObjectURL(file);

      const dimensions = await new Promise<{ width: number; height: number }>(
        (resolve, reject) => {
          const img = new window.Image();
          img.onload = () =>
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => reject(new Error("Could not read that image"));
          img.src = objectUrl;
        },
      ).finally(() => URL.revokeObjectURL(objectUrl));

      const key = await uploadFile(file, domain.uploadFolder, subjectId);

      setBackgroundKey(key);
      setCanvasWidth(dimensions.width);
      setCanvasHeight(dimensions.height);
      // Follow the artwork. An admin who uploads a tall background means a
      // portrait certificate; they can still override it below.
      setOrientation(inferOrientation(dimensions.width, dimensions.height));

      // A template with no name field cannot be saved, so start it off right.
      if (!fields.length) {
        setFields([{ key: "recipientName", ...fieldDefaults.recipientName }]);
        setSelectedKey("recipientName");
      }

      toast.success("Background uploaded");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  const updateField = useCallback(
    (key: string, patch: Partial<CertificateField>) => {
      setFields((prev) =>
        prev.map((f) => (f.key === key ? { ...f, ...patch } : f)),
      );
    },
    [],
  );

  const addField = useCallback(
    (key: string) => {
      setFields((prev) =>
        // Belt and braces: the menu only offers unused keys, but the render
        // draws a duplicated placeholder twice and it reads as a bug.
        prev.some((f) => f.key === key)
          ? prev
          : [...prev, { key, ...fieldDefaults[key] }],
      );
      setSelectedKey(key);
    },
    [fieldDefaults],
  );

  const removeField = useCallback((key: string) => {
    // The name is what makes it a certificate; everything else is optional
    // decoration.
    if (key === "recipientName") return;

    setFields((prev) => prev.filter((f) => f.key !== key));
    setSelectedKey((current) => (current === key ? null : current));
  }, []);

  const payload = useCallback(
    (): CertificateTemplatePayload => ({
      name,
      backgroundKey,
      canvasWidth,
      canvasHeight,
      orientation,
      fields,
    }),
    [name, backgroundKey, canvasWidth, canvasHeight, orientation, fields],
  );

  // The title is the one sample value that is real — the preview endpoint
  // substitutes it, so the canvas has to as well, or a long title looks fine
  // here and overflows in the PDF.
  const sampleValues = useMemo(
    () => ({ ...domain.sampleValues, [domain.titleKey]: domain.title }),
    [domain.sampleValues, domain.titleKey, domain.title],
  );

  const fitted = useFittedFontSizes(fields, sampleValues, canvasWidth);

  const shrunkFields = fields.filter((field) => fitted[field.key]?.shrunk);

  const canSubmit =
    !!backgroundKey &&
    !!name.trim() &&
    fields.some((f) => f.key === "recipientName");

  // Gated on `canSubmit` so a half-configured new template does not nag about
  // changes it could not save anyway.
  const dirty = canSubmit && savedSnapshot !== JSON.stringify(payload());

  const pageWidthPt = CERTIFICATE_PAGE_WIDTH_PT[orientation];
  const pageHeightPt = canvasWidth ? pageWidthPt / (canvasWidth / canvasHeight) : 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = payload();
      await service.saveTemplate(subjectId, body);
      setSavedSnapshot(JSON.stringify(body));
      toast.success("Template saved");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not save the template"));
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    setWarnings([]);

    try {
      const preview = await service.preview(subjectId, payload());

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = preview.url;

      setPreviewUrl(preview.url);
      setWarnings(preview.warnings);
      setPreviewOpen(true);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not render a preview"));
    } finally {
      setPreviewing(false);
    }
  };

  const selected = fields.find((f) => f.key === selectedKey) || null;
  const unusedKeys = domain.fieldKeys.filter(
    (k) => !fields.some((f) => f.key === k),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="certificate-name">Certificate name</Label>
          <Input
            id="certificate-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-72"
          />
        </div>

        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs text-muted-foreground">
              Unsaved changes
            </span>
          )}
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={!canSubmit || previewing}
          >
            {previewing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            Preview PDF
          </Button>
          <Button onClick={handleSave} disabled={!canSubmit || saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save template
          </Button>
        </div>
      </div>

      {/* The render is the source of truth about fonts and overflow — the
          browser cannot know what is installed on the server. */}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            The render reported {warnings.length} issue
            {warnings.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-2 space-y-1 pl-6 text-xs text-amber-700 list-disc">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          {backgroundKey ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                  {ORIENTATIONS.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setOrientation(value)}
                      className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        orientation === value
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>

                <Select
                  value={typeof zoom === "number" ? String(zoom) : zoom}
                  onValueChange={(value) =>
                    setZoom(value === "fit" ? "fit" : Number(value))
                  }
                >
                  <SelectTrigger className="h-8 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ZOOM_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <CertificateCanvas
                backgroundUrl={resolveStorageUrl(backgroundKey)}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
                fields={fields}
                values={sampleValues}
                fieldLabels={fieldLabels}
                fitted={fitted}
                selectedKey={selectedKey}
                zoom={zoom}
                onSelect={setSelectedKey}
                onMove={updateField}
                onDelete={removeField}
              />
            </>
          ) : (
            <label className="flex h-64 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary">
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Upload className="h-6 w-6" />
              )}
              <span className="text-sm font-medium">
                Upload the certificate background
              </span>
              <span className="text-xs">PNG or JPG, up to {MAX_BACKGROUND_MB}MB</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                }}
              />
            </label>
          )}

          {backgroundKey && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {canvasWidth} × {canvasHeight}px — prints at{" "}
                {Math.round(pageWidthPt * PT_TO_MM)} ×{" "}
                {Math.round(pageHeightPt * PT_TO_MM)}mm. Drag a field, or nudge
                it with the arrow keys.
              </span>
              <label className="cursor-pointer underline hover:text-foreground">
                Replace background
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                  }}
                />
              </label>
            </div>
          )}

          {/* Shrink-to-fit is the render's silent correction. Saying so here
              means an admin finds out while designing, not from a warning
              after the preview round trip. */}
          {shrunkFields.length > 0 && (
            <p className="text-xs text-amber-600">
              {shrunkFields
                .map(
                  (field) =>
                    `${fieldLabels[field.key]} shrinks from ${
                      field.fontSize
                    }px to ${fitted[field.key]?.size}px to fit its max width`,
                )
                .join("; ")}
              .
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Fields</Label>
            <div className="space-y-1.5">
              {fields.map((field) => (
                <div
                  key={field.key}
                  className={`flex items-center justify-between rounded-md border px-2.5 py-2 text-sm ${
                    selectedKey === field.key ? "border-primary" : "border-border"
                  }`}
                >
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => setSelectedKey(field.key)}
                  >
                    {fieldLabels[field.key]}
                  </button>
                  {field.key !== "recipientName" && (
                    <button
                      type="button"
                      onClick={() => removeField(field.key)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* A menu, not a Select. Adding a field is an action, not a value
                being chosen — and as a Select it was pinned to `value=""`,
                which is what stopped it selecting anything at all. */}
            {unusedKeys.length > 0 && backgroundKey && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <Plus className="h-3.5 w-3.5" />
                    Add a field
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[248px]">
                  {unusedKeys.map((key) => (
                    <DropdownMenuItem key={key} onSelect={() => addField(key)}>
                      {fieldLabels[key]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {selected && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {fieldLabels[selected.key]}
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">X (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={selected.x}
                    onChange={(e) =>
                      updateField(selected.key, {
                        x: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Y (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={selected.y}
                    onChange={(e) =>
                      updateField(selected.key, {
                        y: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Font size</Label>
                  <Input
                    type="number"
                    min={6}
                    value={selected.fontSize}
                    onChange={(e) =>
                      updateField(selected.key, {
                        fontSize: Number(e.target.value) || 6,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Colour</Label>
                  <Input
                    type="color"
                    value={selected.color}
                    onChange={(e) =>
                      updateField(selected.key, { color: e.target.value })
                    }
                    className="h-9 p-1"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Font</Label>
                <Select
                  value={selected.fontFamily || CERTIFICATE_SYSTEM_FONT_VALUE}
                  onValueChange={(value) =>
                    updateField(selected.key, {
                      fontFamily:
                        value === CERTIFICATE_SYSTEM_FONT_VALUE
                          ? undefined
                          : value,
                      // Carrying a weight the new family does not ship would
                      // render as the nearest one with a warning attached. Move
                      // it now, while the admin can see it happen.
                      fontWeight: nearestCertificateWeight(
                        value === CERTIFICATE_SYSTEM_FONT_VALUE
                          ? undefined
                          : value,
                        normalizeCertificateWeight(selected.fontWeight),
                      ),
                    })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CERTIFICATE_SYSTEM_FONT_VALUE}>
                      System default ({CERTIFICATE_DEFAULT_FONT_FAMILY})
                    </SelectItem>
                    {CERTIFICATE_FONTS.map((font) => (
                      <SelectItem key={font.family} value={font.family}>
                        <span style={{ fontFamily: font.stack }}>
                          {font.family}
                        </span>
                        <span className="text-muted-foreground">
                          {font.category}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Weight</Label>
                  {/* Only the weights this family actually ships. */}
                  <Select
                    value={String(
                      nearestCertificateWeight(
                        selected.fontFamily,
                        normalizeCertificateWeight(selected.fontWeight),
                      ),
                    )}
                    onValueChange={(value) =>
                      updateField(selected.key, {
                        fontWeight: Number(value) as CertificateFontWeight,
                      })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {certificateFontDefinition(selected.fontFamily).weights.map(
                        (weight) => (
                          <SelectItem key={weight} value={String(weight)}>
                            <span style={{ fontWeight: weight }}>
                              {CERTIFICATE_WEIGHT_LABELS[weight]}
                            </span>
                            <span className="text-muted-foreground">
                              {weight}
                            </span>
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Align</Label>
                  <Select
                    value={selected.align || "center"}
                    onValueChange={(value) =>
                      updateField(selected.key, {
                        align: value as CertificateField["align"],
                      })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Max width (% of canvas)</Label>
                <Input
                  type="number"
                  min={10}
                  max={100}
                  value={selected.maxWidth ?? 100}
                  onChange={(e) =>
                    updateField(selected.key, {
                      maxWidth: Number(e.target.value) || 100,
                    })
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Long names shrink to fit this rather than running off the edge.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <CertificatePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        url={previewUrl}
      />
    </div>
  );
}
