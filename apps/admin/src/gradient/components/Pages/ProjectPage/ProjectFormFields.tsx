"use client";

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
import { SlugInput } from "@/gradient/components/Common/SlugInput";

import { projectService } from "@/gradient/services/projectService";
import {
  PROJECT_LEVELS,
  PROJECT_LEVEL_LABELS,
  Project,
  ProjectCategory,
  ProjectLevel,
} from "@/gradient/types/project";
import TagInput from "./TagInput";

/**
 * The project form, as values plus two field groups.
 *
 * Split rather than one component because the workspace renders Details and
 * Settings on **separate tabs sharing one state and one Save**: switching tabs
 * must not lose an edit, and one save has to write both. A self-contained form
 * per tab would mean two dirty flags, two saves, and an admin who changes a
 * switch on one tab and a title on the other losing whichever they wrote first.
 */

export const NO_LEVEL = "__none";

export interface ProjectFormValues {
  title: string;
  slug: string;
  summary: string;
  categoryId: string;
  level: string;
  downloadUrl: string;
  prerequisites: string[];
  skills: string[];
  gateDownload: boolean;
  gateGuide: boolean;
  freeGuideSteps: number;
  trackProgress: boolean;
}

export const emptyValues: ProjectFormValues = {
  title: "",
  slug: "",
  summary: "",
  categoryId: "",
  level: NO_LEVEL,
  downloadUrl: "",
  prerequisites: [],
  skills: [],
  gateDownload: true,
  gateGuide: true,
  freeGuideSteps: 1,
  trackProgress: true,
};

export const toFormValues = (project: Project): ProjectFormValues => ({
  title: project.title ?? "",
  slug: project.slug ?? "",
  summary: project.summary ?? "",
  categoryId: project.categoryId ?? "",
  level: project.level ?? NO_LEVEL,
  downloadUrl: project.downloadUrl ?? "",
  prerequisites: project.prerequisites ?? [],
  skills: project.skills ?? [],
  gateDownload: project.settings?.gateDownload ?? true,
  gateGuide: project.settings?.gateGuide ?? true,
  freeGuideSteps: project.settings?.freeGuideSteps ?? 1,
  trackProgress: project.settings?.trackProgress ?? true,
});

/** The same shape the backend derives in `beforeValidate`, so the preview is honest. */
export const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Mirrors `isPublicHttpUrl` on the backend, so the error arrives before the
 * save rather than as a 400 afterwards.
 *
 * http/https only — the same rule, for the same reason: a `javascript:` URL
 * rendered into an `href` is stored XSS with extra steps.
 */
export const isPublicHttpUrl = (value: string) => {
  if (!value.trim()) return false;
  try {
    const { protocol } = new URL(value.trim());
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

export const validateProject = (values: ProjectFormValues) => {
  const errors: Record<string, string> = {};

  if (!values.title.trim()) errors.title = "A title is required";

  if (!values.categoryId) {
    // Required on create even though the column is nullable — the tile grid is
    // the only navigation the section has, so a project filed nowhere is one
    // nobody will find.
    errors.categoryId = "Pick a category — it is how people browse";
  }

  if (values.downloadUrl && !isPublicHttpUrl(values.downloadUrl)) {
    errors.downloadUrl = "Must be a full http:// or https:// link";
  }

  return errors;
};

export const toPayload = (values: ProjectFormValues) => ({
  title: values.title.trim(),
  slug: values.slug.trim() || undefined,
  summary: values.summary.trim() || undefined,
  categoryId: values.categoryId,
  level: values.level === NO_LEVEL ? null : (values.level as ProjectLevel),
  downloadUrl: values.downloadUrl.trim() || undefined,
  prerequisites: values.prerequisites,
  skills: values.skills,
  // Sent whole every time. JSONB blocks are merged one key deep on the backend,
  // so a partial object would silently keep old switch values.
  settings: {
    gateDownload: values.gateDownload,
    gateGuide: values.gateGuide,
    // Floored at 1: locking the first step leaves a reader nothing to judge the
    // guide by before being asked for an email, which converts worse than not
    // gating at all. The API clamps it too.
    freeGuideSteps: Math.max(1, Math.floor(Number(values.freeGuideSteps) || 1)),
    trackProgress: values.trackProgress,
  },
});

interface FieldProps {
  values: ProjectFormValues;
  onChange: <K extends keyof ProjectFormValues>(
    key: K,
    value: ProjectFormValues[K],
  ) => void;
  errors: Record<string, string>;
  categories: ProjectCategory[];
  /** Absent when creating. */
  project?: Project;
  /**
   * Create fills the slug in from the title as you type, until you edit it
   * yourself. On an existing project the slug is left alone — it is the live
   * URL, and renaming a project must not silently move its page.
   */
  autoSlug?: boolean;
  onSlugTouched?: () => void;
}

export function DetailsFields({
  values,
  onChange,
  errors,
  categories,
  project,
  autoSlug,
  onSlugTouched,
}: FieldProps) {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Basics
        </h3>

        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={values.title}
            onChange={(e) => onChange("title", e.target.value)}
            placeholder="Multiplayer Game — Connect4"
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title}</p>
          )}
        </div>

        <div className="space-y-1">
          <SlugInput
            value={values.slug}
            initialSlug={project?.slug}
            onChange={(e) => {
              onSlugTouched?.();
              onChange("slug", e.target.value);
            }}
            checkService={(slug) =>
              projectService.checkSlugAvailability(slug, project?.id)
            }
            placeholder="multiplayer-game-connect4"
          />
          {autoSlug && (
            <p className="text-xs text-muted-foreground">
              Filled in from the title. Edit it and it stops following.
            </p>
          )}
          {project?.isPublished && (
            <p className="text-xs text-amber-600">
              This project is live. Changing the slug changes its public URL and
              breaks any link already shared.
            </p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={values.categoryId}
              onValueChange={(v) => onChange("categoryId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.categoryId && (
              <p className="text-sm text-destructive">{errors.categoryId}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Level</Label>
            <Select
              value={values.level}
              onValueChange={(v) => onChange("level", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="No level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_LEVEL}>No level</SelectItem>
                {PROJECT_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {PROJECT_LEVEL_LABELS[level]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Summary</Label>
          <Textarea
            value={values.summary}
            onChange={(e) => onChange("summary", e.target.value)}
            rows={4}
            placeholder="The paragraph on the listing card. Plain text, a few lines."
          />
          <p className="text-xs text-muted-foreground">
            This is the card blurb, not the guide. The guide is written on its
            own tab.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Download link
        </h3>

        <div className="space-y-2">
          <Label>Project URL</Label>
          <Input
            value={values.downloadUrl}
            onChange={(e) => onChange("downloadUrl", e.target.value)}
            placeholder="https://github.com/…"
          />
          {errors.downloadUrl ? (
            <p className="text-sm text-destructive">{errors.downloadUrl}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Required before this project can be published. We don&apos;t host
              the files — this link is what the Download button opens.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Prerequisites &amp; skills
        </h3>

        <TagInput
          label="Prerequisite(s)"
          value={values.prerequisites}
          onChange={(v) => onChange("prerequisites", v)}
          placeholder="Python, HTML, CSS"
          hint="Type or paste, comma separated. Enter to add."
        />

        <TagInput
          label="Skills to be learned"
          value={values.skills}
          onChange={(v) => onChange("skills", v)}
          placeholder="REST API, Sockets, Data Visualisation"
          hint="These render as the chips on the card."
        />
      </section>
    </div>
  );
}

export function SettingsFields({
  values,
  onChange,
}: Pick<FieldProps, "values" | "onChange">) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-6 rounded-lg border p-4">
        <div>
          <Label>Ask for details before downloading</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            On, the Download button opens a form (name, email, phone) and the
            link is only released afterwards. Off, the link is public and
            nothing is recorded.
          </p>
        </div>
        <Switch
          checked={values.gateDownload}
          onCheckedChange={(v) => onChange("gateDownload", v)}
        />
      </div>


      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <Label>Ask for details before reading the whole guide</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              On, the steps after the free ones ask for the same name, email and
              phone the download does — and one form opens both. Off, the whole
              guide reads for anybody.
            </p>
          </div>
          <Switch
            checked={values.gateGuide}
            onCheckedChange={(v) => onChange("gateGuide", v)}
          />
        </div>

        {values.gateGuide && (
          <div className="flex items-center justify-between gap-6 border-t pt-4">
            <div>
              <Label htmlFor="freeGuideSteps">Steps that read free</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                A gated step is a step Google cannot index. 1 converts hardest;
                3–4 leaves the setup steps earning search traffic.
              </p>
            </div>
            <Input
              id="freeGuideSteps"
              type="number"
              min={1}
              value={values.freeGuideSteps}
              onChange={(e) =>
                onChange("freeGuideSteps", Number(e.target.value))
              }
              className="w-20"
            />
          </div>
        )}
      </div>

      <div className="flex items-start justify-between gap-6 rounded-lg border p-4">
        <div>
          <Label>Track progress through the guide</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Shows tick marks and a Resume button to signed-in readers. The guide
            itself stays readable by anyone either way.
          </p>
        </div>
        <Switch
          checked={values.trackProgress}
          onCheckedChange={(v) => onChange("trackProgress", v)}
        />
      </div>
    </div>
  );
}
