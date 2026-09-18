"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Check,
  ExternalLink,
  Eye,
  Loader2,
  Save,
  Search,
  Send,
  Undo2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useNotification } from "@/helpers/NotificationContext";
import { useAutomationBasePath } from "@/hooks/useAutomationBasePath";
import { openRecordingPreview, siteUrl } from "@/lib/preview";
import {
  checkSlugAvailability,
  getAllRecordings,
  getRecordingById,
  getRecordingCategories,
  toggleRecordingStatus,
  updateRecording,
} from "@/services/recordings/recordingsService";
import {
  RECORDING_FORMATS,
  RECORDING_SETTINGS_DEFAULTS,
  RELATED_LIMIT,
  SETTINGS_FIELDS,
  isRecordingLive,
  parseYouTubeVideoId,
} from "@/utils/recording";
import {
  RecordingCategory,
  RecordingHost,
  RecordingContent,
  RecordingResponse,
  RecordingSettings,
  RecordingSpeaker,
} from "@/types/recording";

import ContentSection from "./ContentSection";
import SpeakersSection from "./SpeakersSection";
import ThumbnailUploader from "./ThumbnailUploader";

const TABS = ["details", "seo", "settings"] as const;
type Tab = (typeof TABS)[number];

/**
 * "No badge", as a value the Select can hold.
 *
 * Radix reserves the empty string to mean "nothing selected" and throws if an
 * item uses it, so unset needs a sentinel — stripped back to "" on change and
 * sent as null.
 */
const NO_FORMAT = "none";

/**
 * Tabs, one save.
 *
 * The form is a single piece of state and the API takes one `PUT`, so a save
 * button per tab would either fire several requests or lie about its scope. It
 * sits in the page header instead, visible from every tab, with a dot when there
 * is something unsaved — the tabs divide the *reading*, not the transaction.
 */
export default function EditRecordingPage() {
  const router = useRouter();
  const params = useParams();
  const basePath = useAutomationBasePath();
  const { showNotification } = useNotification();

  const recordingId = String(params?.["recording-id"] ?? "");

  const [recording, setRecording] = useState<RecordingResponse | null>(null);
  const [categories, setCategories] = useState<RecordingCategory[]>([]);
  const [siblings, setSiblings] = useState<RecordingResponse[]>([]);
  const [siblingsLoading, setSiblingsLoading] = useState(false);
  const [relatedQuery, setRelatedQuery] = useState("");
  const [debouncedRelatedQuery, setDebouncedRelatedQuery] = useState("");

  /**
   * The chosen recordings themselves, not just their ids.
   *
   * The picker's list is a *search result*, so anything already chosen can drop
   * out of it — by a search that does not match it, or by simply being older
   * than the page the list is showing. Holding the rows means the choices stay
   * on screen and stay un-checkable whatever the search says, which is the
   * difference between a filter and a trap.
   */
  const [picked, setPicked] = useState<RecordingResponse[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("details");
  const [previewing, setPreviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);

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

  const [host, setHost] = useState<RecordingHost>({});
  const [speakers, setSpeakers] = useState<RecordingSpeaker[]>([]);
  const [content, setContent] = useState<RecordingContent>({});
  const [settings, setSettings] = useState<RecordingSettings>({});

  const update = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  useEffect(() => {
    if (!recordingId) return;

    const load = async () => {
      try {
        const [recordingRes, categoryRes] = await Promise.all([
          getRecordingById(recordingId),
          getRecordingCategories(),
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
        showNotification(
          "error",
          error?.response?.data?.message || "Could not load the recording"
        );
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingId]);

  // Long enough that a typed title does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedRelatedQuery(relatedQuery), 400);
    return () => clearTimeout(timer);
  }, [relatedQuery]);

  /**
   * Candidates for the "Keep exploring" picker. Best-effort — the editor stays
   * usable without it.
   *
   * The search goes to the **API**, not to the rows already in hand. The list is
   * capped at 50, so filtering what was fetched would quietly search only the 50
   * newest and report "no matches" for a recording that exists — which is worse
   * than no search at all, because it looks like an answer.
   */
  useEffect(() => {
    if (!recordingId) return;

    let cancelled = false;
    setSiblingsLoading(true);

    getAllRecordings({
      limit: 50,
      isPublished: true,
      q: debouncedRelatedQuery.trim() || undefined,
    })
      .then((res) => {
        if (!cancelled) {
          setSiblings((res.data ?? []).filter((r) => r.id !== recordingId));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSiblingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [recordingId, debouncedRelatedQuery]);

  /**
   * Resolve the saved picks to rows, once per load.
   *
   * Read one at a time rather than off the list: a pick made months ago may sit
   * well outside the newest 50, and an id with no title to show for it would
   * render as a blank line somebody cannot identify or safely remove. Capped at
   * `RELATED_LIMIT`, so this is three reads at worst.
   */
  useEffect(() => {
    const ids = recording?.relatedRecordingIds ?? [];

    if (!ids.length) return;

    let cancelled = false;

    Promise.all(
      ids.map((id) =>
        getRecordingById(id)
          .then((res) => res.data as RecordingResponse)
          .catch(() => null)
      )
    ).then((rows) => {
      if (!cancelled) setPicked(rows.filter(Boolean) as RecordingResponse[]);
    });

    return () => {
      cancelled = true;
    };
  }, [recording?.id, recording?.relatedRecordingIds]);

  // The slug is a URL people hold. Checked as it is typed, debounced, and never
  // checked against the recording's own current slug — that one is not "taken".
  useEffect(() => {
    const slug = form.slug.trim();

    if (!slug || slug === recording?.slug) {
      setSlugAvailable(null);
      return;
    }

    setCheckingSlug(true);
    const timer = setTimeout(async () => {
      try {
        const result = await checkSlugAvailability(slug, recordingId);
        setSlugAvailable(result?.available ?? true);
      } catch {
        setSlugAvailable(null);
      } finally {
        setCheckingSlug(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [form.slug, recording?.slug, recordingId]);

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
    [form.videoUrl]
  );

  const videoError = Boolean(form.videoUrl) && !parsedVideoId;

  /* ── the "Keep exploring" picker ─────────────────────────────────────── */

  const pickedIds = form.relatedRecordingIds;

  /** Search results, minus anything already pinned above them. */
  const unpickedSiblings = siblings.filter((row) => !pickedIds.includes(row.id));

  /**
   * Toggling keeps `picked` in step with the ids, because the row may not be in
   * the search results next time it is looked for.
   */
  const toggleRelated = (row: RecordingResponse) => {
    const checked = pickedIds.includes(row.id);

    update(
      "relatedRecordingIds",
      checked ? pickedIds.filter((id) => id !== row.id) : [...pickedIds, row.id]
    );

    setPicked((prev) =>
      checked ? prev.filter((r) => r.id !== row.id) : [...prev, row]
    );
  };

  const relatedRow = (row: RecordingResponse) => {
    const checked = pickedIds.includes(row.id);
    const atLimit = pickedIds.length >= RELATED_LIMIT;

    return (
      <label
        key={row.id}
        className={`flex items-start gap-2 rounded p-1.5 text-sm ${
          checked ? "bg-gray-50" : "hover:bg-gray-50"
        } ${!checked && atLimit ? "opacity-50" : ""}`}
      >
        <input
          type="checkbox"
          className="mt-1"
          checked={checked}
          disabled={!checked && atLimit}
          onChange={() => toggleRelated(row)}
        />
        <span className="min-w-0">
          <span className="block truncate">{row.title}</span>
          {row.category?.name && (
            <span className="block text-xs text-gray-500">
              {row.category.name}
            </span>
          )}
        </span>
      </label>
    );
  };


  const setting = (key: keyof typeof RECORDING_SETTINGS_DEFAULTS) =>
    settings[key] ?? RECORDING_SETTINGS_DEFAULTS[key];

  /**
   * Returns whether the save actually landed.
   *
   * Publishing saves first and must not act on a stale row, so "did this work"
   * has to be answerable by the caller. Every early return below is a refusal,
   * not a no-op.
   */
  const handleSave = async (): Promise<boolean> => {
    if (!form.title.trim()) {
      setActiveTab("details");
      showNotification("error", "Title is required");
      return false;
    }

    if (videoError) {
      // Jump to the tab holding the problem — a toast about a field on a tab you
      // cannot see is a dead end.
      setActiveTab("details");
      showNotification("error", "That video link is not a YouTube URL");
      return false;
    }

    if (slugAvailable === false) {
      setActiveTab("details");
      showNotification("error", "That slug is already taken");
      return false;
    }

    setSaving(true);

    try {
      /**
       * The whole of every JSONB block goes on the wire, always.
       *
       * The API merges these one key deep so a partial save cannot blank the
       * rest — which means the reverse is also true: a key we omit is preserved.
       * Sending only "what changed" would make deleting the last bullet from a
       * list impossible, and would look like the server ignoring the admin.
       */
      const response = await updateRecording(recordingId, {
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
        showNotification("error", response.message || "Could not save");
        return false;
      }

      setRecording(response.data);
      setDirty(false);
      showNotification("success", "Saved");
      return true;
    } catch (error: any) {
      showNotification(
        "error",
        error?.response?.data?.message || "Could not save"
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  /**
   * Publish saves first, then flips the switch.
   *
   * Publishing a row while the editor holds unsaved edits would put the *old*
   * version live — the one thing an admin pressing "Publish" is certain they are
   * not doing. A failed save stops here; `handleSave` has already switched to
   * the offending tab and said why.
   *
   * The API refuses to publish without a video, and its message is what the
   * admin needs to read, so it is surfaced rather than swallowed.
   */
  /**
   * Opens this recording on the public site with the publish filters lifted.
   *
   * Saves first, for the same reason Publish does: a preview of the *stored*
   * row is not a preview of what is on screen, and the whole question being
   * asked is "does what I just wrote look right". A failed save stops here —
   * `handleSave` has already switched to the offending tab and said why.
   *
   * Unlike "Quick look", which draws an approximation of the page inside the
   * panel from unsaved state, this is the page itself: the real fonts, the real
   * gate, the real embed.
   */
  const handleSitePreview = async () => {
    if (dirty && !(await handleSave())) return;

    setPreviewing(true);
    try {
      if (!(await openRecordingPreview(recordingId))) {
        showNotification("error", "Couldn't open the preview. Please try again");
      }
    } finally {
      setPreviewing(false);
    }
  };

  const handleTogglePublish = async () => {
    if (dirty && !(await handleSave())) return;

    setPublishing(true);
    try {
      const response = await toggleRecordingStatus(recordingId);
      setRecording((prev) =>
        prev ? { ...prev, ...response.data } : response.data
      );
      showNotification(
        "success",
        response.isPublished
          ? "Published — this is live on the site"
          : "Moved back to draft"
      );
    } catch (error: any) {
      showNotification(
        "error",
        error?.response?.data?.message || "Could not change the status"
      );
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!recording) {
    return (
      <div className="p-6 text-sm text-gray-500">Recording not found.</div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      <div className="flex h-16 items-center justify-between border-b border-gray-200 px-5">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`${basePath}/recordings`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="max-w-lg truncate text-lg font-semibold text-gray-900">
            {recording.title}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Status, then the button that changes it. Read left to right,
              "Draft · Publish" says what this is and what happens next. */}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              recording.isPublished
                ? "bg-green-50 text-green-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {recording.isPublished ? "Live" : "Draft"}
          </span>

          {dirty && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Unsaved changes
            </span>
          )}

          <Button
            variant="ghost"
            title="Leads and stats"
            onClick={() =>
              router.push(`${basePath}/recordings/manage/${recordingId}`)
            }
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            Manage
          </Button>

          {/* Live recordings get the real URL, not a preview link. Preview
              exists to reach a page the public cannot, and once the page is
              public it is only a slower way to open it — one that burns a
              single-use token and leaves a preview cookie behind. */}
          {isRecordingLive(recording) ? (
            <Button variant="outline" asChild>
              <a
                href={`${siteUrl()}/recordings/${recording.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View on site
              </a>
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleSitePreview}
              disabled={previewing || saving}
            >
              {previewing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              Preview
            </Button>
          )}

          <Button
            variant={recording.isPublished ? "outline" : "default"}
            onClick={handleTogglePublish}
            disabled={publishing || saving}
          >
            {publishing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : recording.isPublished ? (
              <Undo2 className="mr-2 h-4 w-4" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {recording.isPublished ? "Move to draft" : "Publish"}
          </Button>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50 p-5 pb-16">
        <Tabs
          value={activeTab}
          onValueChange={(tab) => setActiveTab(tab as Tab)}
          className="mb-5"
        >
          <TabsList>
            <TabsTrigger value="details">
              Details
              {/* A missing or broken video is the one thing that blocks
                  publishing, so it is worth flagging from the other tabs. */}
              {(videoError || !parsedVideoId) && (
                <span className="ml-1.5 text-amber-600">!</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="seo">SEO</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Details — everything editorial, in the order the page reads. */}
        {activeTab === "details" && (
          <div className="space-y-5">
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-base font-semibold text-gray-900">
                Basics
              </h2>

              <div className="space-y-4">
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
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        ) : slugAvailable === true ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : slugAvailable === false ? (
                          <X className="h-4 w-4 text-red-600" />
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
                    <Label>Format</Label>
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
                    <p className="text-xs text-gray-500">
                      The badge on the listing card. Optional.
                    </p>
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
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-base font-semibold text-gray-900">
                Video
              </h2>

              <div className="space-y-4">
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
                    <p className="flex items-center gap-1.5 text-xs text-red-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Not a YouTube link. Paste a watch, share, or embed URL.
                    </p>
                  ) : parsedVideoId ? (
                    <p className="text-xs text-green-600">
                      Video ID: <code>{parsedVideoId}</code>
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500">
                      Required before this recording can be published.
                    </p>
                  )}
                </div>

                {parsedVideoId && (
                  <iframe
                    className="aspect-video w-full max-w-md rounded-md border border-gray-200"
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
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-base font-semibold text-gray-900">
                Thumbnail
              </h2>
              <ThumbnailUploader
                value={form.thumbnail}
                onChange={(url) => update("thumbnail", url)}
              />
            </div>

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

            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-base font-semibold text-gray-900">
                Sidebar
              </h2>

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label>Keep exploring</Label>
                  <p className="text-xs text-gray-500">
                    Up to {RELATED_LIMIT}. Leave empty to fill automatically with
                    the newest recordings in the same category.
                  </p>

                  <div className="relative">
                    <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <Input
                      value={relatedQuery}
                      onChange={(e) => setRelatedQuery(e.target.value)}
                      placeholder="Search recordings by title or slug"
                      className="h-9 pl-8 text-sm"
                    />
                    {siblingsLoading && (
                      <Loader2 className="absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-gray-400" />
                    )}
                  </div>

                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
                    {/* The chosen ones, always, above the search. A pick that
                        scrolled out of the result set is still a pick, and it
                        has to stay un-checkable or the only way to change your
                        mind is to guess the search that brings it back. */}
                    {picked.map((row) => relatedRow(row))}

                    {picked.length > 0 && unpickedSiblings.length > 0 && (
                      <div className="my-1 border-t border-gray-100" />
                    )}

                    {unpickedSiblings.map((row) => relatedRow(row))}

                    {picked.length === 0 && unpickedSiblings.length === 0 && (
                      <p className="p-2 text-sm text-gray-500">
                        {relatedQuery.trim()
                          ? `No published recordings match "${relatedQuery.trim()}".`
                          : "No other published recordings yet."}
                      </p>
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
                  <p className="text-xs text-gray-500">
                    The live session attendance, typed in by hand — nothing
                    counts it for you.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "seo" && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-base font-semibold text-gray-900">SEO</h2>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Meta title</Label>
                <Input
                  value={form.seoTitle}
                  onChange={(e) => update("seoTitle", e.target.value)}
                  placeholder={form.title}
                />
                <p className="text-xs text-gray-500">
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
                <p className="text-xs text-gray-500">
                  Shown in search results and link previews. Aim for about 155
                  characters.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-base font-semibold text-gray-900">
              Settings
            </h2>

            <div className="space-y-4">
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
                    <p className="text-xs text-gray-500">{field.help}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
