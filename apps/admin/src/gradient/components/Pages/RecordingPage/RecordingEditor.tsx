"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ExternalLink,
  FileText,
  Loader2,
  Save,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Textarea } from "@/gradient/components/ui/textarea";
import { Switch } from "@/gradient/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import { TabSwitcher } from "@/gradient/components/ui/custom/TabSwitcher";

import { recordingService } from "@/gradient/services/recordingService";
import { openRecordingPreview } from "@/gradient/lib/preview";
import { parseYouTubeVideoId } from "@/gradient/lib/youtube";
import { useSlugAvailability } from "@/gradient/hooks/useSlugAvailability";
import {
  RECORDING_FORMATS,
  RECORDING_SETTINGS_DEFAULTS,
  RELATED_LIMIT,
  SETTINGS_FIELDS,
} from "@/gradient/constants/recording";
import {
  RecordingCategory,
  RecordingResponse,
  RecordingSettings,
} from "@/gradient/types/recording";

import ContentSection from "./ContentSection";
import SpeakersSection from "./SpeakersSection";
import ThumbnailUploader from "@/gradient/components/Common/ThumbnailUploader";
import { ToggleRecordingStatus } from "./ToggleRecordingStatus";

const TABS = ["details", "seo", "settings"] as const;

/**
 * "No badge", as a value the Select can hold.
 *
 * Radix reserves the empty string to mean "nothing selected" and throws if an
 * item uses it, so unset needs a sentinel — stripped back to "" on change and
 * sent as null. Same reason `ANY` exists in `RecordingFilters`.
 */
const NO_FORMAT = "none";
type Tab = (typeof TABS)[number];

/**
 * Tabs, one save.
 *
 * The form is a single piece of state and the API takes one `PUT`, so a save
 * button per tab would either fire several requests or lie about scope. It sits
 * in the page header instead, visible from every tab, with a dot when there is
 * something unsaved — the tabs divide the *reading*, not the transaction.
 */
export default function RecordingEditor({
  recordingId,
}: {
  recordingId: string;
}) {
  const router = useRouter();

  const [recording, setRecording] = useState<RecordingResponse | null>(null);
  const [categories, setCategories] = useState<RecordingCategory[]>([]);
  const [siblings, setSiblings] = useState<RecordingResponse[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("details");

  const [form, setForm] = useState({
    title: "",
    slug: "",
    subtitle: "",
    categoryId: "",
    thumbnail: "",
    videoUrl: "",
    isUnlisted: true,
    durationMinutes: "",
    attendeeCount: "",
    relatedRecordingIds: [] as string[],
    format: "",
    seoTitle: "",
    seoDescription: "",
  });

  const [host, setHost] = useState({});
  const [speakers, setSpeakers] = useState<any[]>([]);
  const [content, setContent] = useState<any>({});
  const [settings, setSettings] = useState<RecordingSettings>({});

  const update = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const checkSlug = useCallback(
    (slug: string) => recordingService.checkSlugAvailability(slug, recordingId),
    [recordingId],
  );

  const { slugAvailable, checkingSlug } = useSlugAvailability(
    form.slug,
    checkSlug,
    recording?.slug,
  );

  useEffect(() => {
    const load = async () => {
      try {
        const [recordingRes, categoryRes] = await Promise.all([
          recordingService.getRecordingById(recordingId),
          recordingService.getCategories(),
        ]);

        const data: RecordingResponse = recordingRes.data;
        setRecording(data);
        setCategories(categoryRes.data ?? []);

        setForm({
          title: data.title ?? "",
          slug: data.slug ?? "",
          subtitle: data.subtitle ?? "",
          categoryId: data.categoryId ?? "",
          thumbnail: data.thumbnail ?? "",
          videoUrl: data.video?.url ?? "",
          isUnlisted: data.video?.isUnlisted ?? true,
          durationMinutes: data.durationMinutes?.toString() ?? "",
          attendeeCount: data.attendeeCount?.toString() ?? "",
          relatedRecordingIds: data.relatedRecordingIds ?? [],
          format: data.format ?? "",
          seoTitle: data.seo?.title ?? "",
          seoDescription: data.seo?.description ?? "",
        });

        setHost(data.host ?? {});
        setSpeakers(data.speakers ?? []);
        setContent(data.content ?? {});
        setSettings(data.settings ?? {});
      } catch (error: any) {
        toast.error(
          error.response?.data?.message || "Could not load the recording",
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [recordingId]);

  // Siblings for the "Keep exploring" picker. Best-effort — the editor stays
  // usable without it.
  useEffect(() => {
    recordingService
      .getAllRecordings({ limit: 50, isPublished: true })
      .then((res) =>
        setSiblings(
          (res.data ?? []).filter((r: RecordingResponse) => r.id !== recordingId),
        ),
      )
      .catch(() => {});
  }, [recordingId]);

  useEffect(() => {
    if (!dirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const parsedVideoId = useMemo(
    () => parseYouTubeVideoId(form.videoUrl),
    [form.videoUrl],
  );

  const videoError = Boolean(form.videoUrl) && !parsedVideoId;

  const setting = (key: keyof typeof RECORDING_SETTINGS_DEFAULTS) =>
    settings[key] ?? RECORDING_SETTINGS_DEFAULTS[key];

  /**
   * Returns whether the save actually landed.
   *
   * Preview saves first and must not open a tab on a stale row, so "did this
   * work" has to be answerable by the caller. Every early return below is a
   * refusal, not a no-op.
   */
  const handleSave = async (): Promise<boolean> => {
    if (!form.title.trim()) {
      setActiveTab("details");
      toast.error("Title is required");
      return false;
    }

    if (videoError) {
      // Jump to the tab holding the problem — a toast about a field on a tab
      // you cannot see is a dead end.
      setActiveTab("details");
      toast.error("That video link is not a YouTube URL");
      return false;
    }

    if (slugAvailable === false) {
      setActiveTab("details");
      toast.error("That slug is already taken");
      return false;
    }

    setSaving(true);

    try {
      /**
       * The whole of every JSONB block goes on the wire, always.
       *
       * The API merges these one key deep so a partial save cannot blank the
       * rest — which means the reverse is also true: a key we omit is
       * preserved. Sending only "what changed" would make deleting the last
       * bullet from a list impossible, and would look like the server ignoring
       * the admin.
       */
      const response = await recordingService.updateRecording(recordingId, {
        title: form.title.trim(),
        slug: form.slug || undefined,
        subtitle: form.subtitle,
        categoryId: form.categoryId || null,
        thumbnail: form.thumbnail || null,
        video: { url: form.videoUrl, isUnlisted: form.isUnlisted },
        durationMinutes: form.durationMinutes
          ? Number(form.durationMinutes)
          : null,
        attendeeCount: form.attendeeCount ? Number(form.attendeeCount) : null,
        relatedRecordingIds: form.relatedRecordingIds,
        format: form.format || null,
        host,
        speakers,
        content,
        settings,
        seo: { title: form.seoTitle, description: form.seoDescription },
      });

      if (!response.success) {
        toast.error(response.message || "Could not save");
        return false;
      }

      setRecording(response.data);
      setDirty(false);
      toast.success("Saved");
      return true;
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not save");
      return false;
    } finally {
      setSaving(false);
    }
  };

  /**
   * Preview saves first.
   *
   * Otherwise the tab opens on whatever was last written and the admin reads
   * their own unsaved edits as missing — which makes the preview look broken.
   * Saving is what makes "preview" mean what it says; it is not a publish, and
   * the recording stays exactly as unpublished as it was. A failed save stops
   * here — `handleSave` has already switched to the offending tab and said why.
   */
  const handlePreview = async () => {
    if (dirty && !(await handleSave())) return;

    setPreviewing(true);
    try {
      await openRecordingPreview(recordingId);
    } finally {
      setPreviewing(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Recording">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!recording) {
    return (
      <DashboardLayout title="Recording">
        <p className="text-muted-foreground">Recording not found.</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={recording.title}
      actions={
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Unsaved changes
            </span>
          )}
          <Button variant="outline" onClick={() => router.push("/recordings")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            variant="ghost"
            onClick={() => void handlePreview()}
            disabled={saving || previewing}
          >
            {previewing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="mr-2 h-4 w-4" />
            )}
            Preview
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>

          {/* Creating a recording lands on this screen, and the create form
              promises you can publish it "there" — meaning here. Before this,
              that promise sent people back to the list to click a status badge.
              Last in the row on purpose: publishing ends the job, and it must
              not sit where Save is expected.

              The local flag is updated rather than the record refetched: the
              form holds unsaved edits, and reloading would throw them away as
              a side effect of publishing. `isPublished` is the only field the
              toggle changes. */}
          <ToggleRecordingStatus
            recording={recording}
            variant="button"
            onChange={(isPublished) =>
              setRecording((prev) => (prev ? { ...prev, isPublished } : prev))
            }
          />
        </div>
      }
    >
      <div className="space-y-6 pb-16">
        <TabSwitcher
          tabs={[
            {
              value: "details",
              label: "Details",
              icon: FileText,
              // A missing or broken video is the one thing that blocks
              // publishing, so it is worth flagging from the other tabs.
              badge: videoError || !parsedVideoId ? "!" : undefined,
            },
            { value: "seo", label: "SEO", icon: Search },
            { value: "settings", label: "Settings", icon: Settings2 },
          ]}
          value={activeTab}
          onChange={(tab) => setActiveTab(tab as Tab)}
        />

        {/* Details — everything editorial, in the order the page reads. */}
        {activeTab === "details" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Basics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Title *</Label>
                    <Input
                      value={form.title}
                      onChange={(e) => update("title", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Slug</Label>
                    <div className="relative">
                      <Input
                        value={form.slug}
                        onChange={(e) => update("slug", e.target.value)}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {checkingSlug ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : slugAvailable === true ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : slugAvailable === false ? (
                          <X className="h-4 w-4 text-destructive" />
                        ) : null}
                      </div>
                    </div>
                    {recording.isPublished && (
                      <p className="text-xs text-amber-600">
                        This recording is live. Changing the slug breaks every
                        link already shared.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Subtitle</Label>
                  <Input
                    value={form.subtitle}
                    onChange={(e) => update("subtitle", e.target.value)}
                    placeholder="The line under the title on the page"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={form.categoryId}
                      onValueChange={(v) => update("categoryId", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Uncategorised" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                            {!category.isActive && " (hidden)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Length (minutes)</Label>
                    <Input
                      type="number"
                      value={form.durationMinutes}
                      onChange={(e) => update("durationMinutes", e.target.value)}
                      placeholder="90"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Format</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  The badge on the listing card. The same kinds the event form
                  offers. Optional — leave it unset and the card carries no
                  badge.
                </p>

                <Select
                  value={form.format || NO_FORMAT}
                  onValueChange={(v) =>
                    update("format", v === NO_FORMAT ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No badge" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_FORMAT}>No badge</SelectItem>
                    {RECORDING_FORMATS.map((format) => (
                      <SelectItem key={format} value={format}>
                        {format}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Video</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>YouTube link *</Label>
                  <Input
                    value={form.videoUrl}
                    onChange={(e) => update("videoUrl", e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                  {/* Read back rather than parsed silently — a mistyped link
                      saves fine and is a dead player on a live page. */}
                  {videoError ? (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Not a YouTube link. Paste a watch, share, or embed URL.
                    </p>
                  ) : parsedVideoId ? (
                    <p className="text-xs text-green-600">
                      Video ID: <code>{parsedVideoId}</code>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Required before this recording can be published.
                    </p>
                  )}
                </div>

                {parsedVideoId && (
                  <iframe
                    className="aspect-video w-full max-w-md rounded-md border"
                    src={`https://www.youtube.com/embed/${parsedVideoId}`}
                    title="Preview"
                    allowFullScreen
                  />
                )}

                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.isUnlisted}
                    onCheckedChange={(v) => update("isUnlisted", v)}
                  />
                  <Label>Unlisted on YouTube</Label>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Thumbnail</CardTitle>
              </CardHeader>
              <CardContent>
                <ThumbnailUploader
                  value={form.thumbnail}
                  onChange={(key) => update("thumbnail", key)}
                />
              </CardContent>
            </Card>

            <SpeakersSection
              host={host}
              speakers={speakers}
              onHostChange={(next) => {
                setHost(next);
                setDirty(true);
              }}
              onSpeakersChange={(next) => {
                setSpeakers(next);
                setDirty(true);
              }}
            />

            <ContentSection
              value={content}
              onChange={(next) => {
                setContent(next);
                setDirty(true);
              }}
            />

            <Card>
              <CardHeader>
                <CardTitle>Sidebar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Keep exploring</Label>
                  <p className="text-xs text-muted-foreground">
                    Up to {RELATED_LIMIT}. Leave empty to fill automatically
                    with the newest recordings in the same category.
                  </p>
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                    {siblings.length === 0 ? (
                      <p className="p-2 text-sm text-muted-foreground">
                        No other published recordings yet.
                      </p>
                    ) : (
                      siblings.map((sibling) => {
                        const checked = form.relatedRecordingIds.includes(
                          sibling.id,
                        );
                        const atLimit =
                          form.relatedRecordingIds.length >= RELATED_LIMIT;

                        return (
                          <label
                            key={sibling.id}
                            className="flex items-center gap-2 rounded p-1 text-sm hover:bg-muted"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!checked && atLimit}
                              onChange={() =>
                                update(
                                  "relatedRecordingIds",
                                  checked
                                    ? form.relatedRecordingIds.filter(
                                        (id) => id !== sibling.id,
                                      )
                                    : [
                                        ...form.relatedRecordingIds,
                                        sibling.id,
                                      ],
                                )
                              }
                            />
                            {sibling.title}
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Attendee count</Label>
                  <Input
                    type="number"
                    className="max-w-xs"
                    value={form.attendeeCount}
                    onChange={(e) => update("attendeeCount", e.target.value)}
                    placeholder="2987"
                  />
                  <p className="text-xs text-muted-foreground">
                    The live session attendance, typed in by hand — nothing
                    counts it for you.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* SEO */}
        {activeTab === "seo" && (
          <Card>
            <CardHeader>
              <CardTitle>SEO</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Meta title</Label>
                <Input
                  value={form.seoTitle}
                  onChange={(e) => update("seoTitle", e.target.value)}
                  placeholder={form.title}
                />
                <p className="text-xs text-muted-foreground">
                  Falls back to the recording title when empty.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Meta description</Label>
                <Textarea
                  rows={3}
                  value={form.seoDescription}
                  onChange={(e) => update("seoDescription", e.target.value)}
                  placeholder={form.subtitle}
                />
                <p className="text-xs text-muted-foreground">
                  Shown in search results and link previews. Aim for about 155
                  characters.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Settings */}
        {activeTab === "settings" && (
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {SETTINGS_FIELDS.map((field) => (
                <div key={field.key} className="flex items-start gap-3">
                  <Switch
                    checked={Boolean(setting(field.key))}
                    onCheckedChange={(value) => {
                      setSettings((prev) => ({ ...prev, [field.key]: value }));
                      setDirty(true);
                    }}
                  />
                  <div>
                    <Label>{field.label}</Label>
                    <p className="text-xs text-muted-foreground">
                      {field.help}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

      </div>
    </DashboardLayout>
  );
}
