"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, ExternalLink, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import ActivityTimeline from "@/gradient/components/Common/ActivityTimeline/ActivityTimeline";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/gradient/components/ui/breadcrumb";
import { Badge } from "@/gradient/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";

import { projectService } from "@/gradient/services/projectService";
import { Project, ProjectCategory, ProjectLead } from "@/gradient/types/project";
import {
  DetailsFields,
  ProjectFormValues,
  SettingsFields,
  toFormValues,
  toPayload,
  validateProject,
} from "./ProjectFormFields";
import { LevelBadge, SourceBadge, StatusBadge } from "./ProjectBadges";
import { ToggleProjectStatus } from "./ToggleProjectStatus";
import GuideEditor from "./GuideEditor";
import EmailTemplateEditor from "./EmailTemplateEditor";

const TABS = ["Details", "Guide", "Settings", "Leads", "Activity"] as const;
type Tab = (typeof TABS)[number];

/** Tabs that edit the form, and so are covered by the header Save. */
const FORM_TABS: Tab[] = ["Details", "Settings"];

/**
 * The one screen for a project.
 *
 * Details and Settings are tabs over **one form state with one Save**, not two
 * self-contained forms: switching tabs must not lose an edit, and an admin who
 * changes a switch on one tab and a title on the other must not lose whichever
 * they wrote first. The Save button lives in the header so it is in the same
 * place whichever tab is open, and so it is reachable without scrolling past a
 * long field list.
 *
 * Guide, Leads and Activity save themselves as you go, so the header button
 * hides on those — a Save that does nothing is worse than no Save at all.
 */
export default function ProjectDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [project, setProject] = useState<Project | null>(null);
  const [categories, setCategories] = useState<ProjectCategory[]>([]);
  const [leads, setLeads] = useState<ProjectLead[]>([]);
  const [loading, setLoading] = useState(true);

  // Deep-linkable, so "created — now write its guide" can land on the right tab
  // and a browser refresh does not bounce back to Details.
  const initialTab = (searchParams.get("tab") ?? "Details") as Tab;
  const [tab, setTab] = useState<Tab>(
    TABS.includes(initialTab) ? initialTab : "Details",
  );

  const [values, setValues] = useState<ProjectFormValues | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [projectRes, categoryRes] = await Promise.all([
        projectService.getProjectById(id),
        projectService.getCategories(),
      ]);

      if (projectRes.success) {
        setProject(projectRes.data);
        setValues(toFormValues(projectRes.data));
      } else {
        toast.error(projectRes.message || "Could not load the project");
      }

      if (categoryRes.success) setCategories(categoryRes.data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not load the project");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab !== "Leads") return;

    const fetchLeads = async () => {
      try {
        const data = await projectService.getLeads({ projectId: id, limit: 50 });
        if (data.success) setLeads(data.data);
      } catch {
        // Non-fatal — the rest of the page still works.
      }
    };

    fetchLeads();
  }, [tab, id]);

  /** Catches a tab close or a hard navigation with unsaved edits. */
  useEffect(() => {
    if (!dirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const handleChange = <K extends keyof ProjectFormValues>(
    key: K,
    value: ProjectFormValues[K],
  ) => {
    setValues((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!values || !project) return;

    const found = validateProject(values);
    setErrors(found);

    if (Object.keys(found).length) {
      // The failing field may be on the tab that is not open, so say so rather
      // than flashing an error nobody can see.
      setTab("Details");
      toast.error("Check the highlighted fields on Details");
      return;
    }

    setSaving(true);
    try {
      const data = await projectService.updateProject(
        project.id,
        toPayload(values) as any,
      );

      if (data.success) {
        toast.success("Project saved");
        setProject(data.data);
        setValues(toFormValues(data.data));
        setDirty(false);
      } else {
        toast.error(data.message || "Could not save the project");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not save the project");
    } finally {
      setSaving(false);
    }
  };

  const changeTab = (next: Tab) => {
    // Leaving a form tab with unsaved edits for a tab that saves itself is the
    // one way to quietly lose work here, so it asks.
    if (
      dirty &&
      FORM_TABS.includes(tab) &&
      !FORM_TABS.includes(next) &&
      !window.confirm("You have unsaved changes. Leave this tab anyway?")
    ) {
      return;
    }

    setTab(next);
    router.replace(`/projects/${id}?tab=${next}`, { scroll: false });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project || !values) {
    return <p className="py-20 text-center">Project not found.</p>;
  }

  const showSave = FORM_TABS.includes(tab);

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/projects">Projects</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{project.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-3">
          {dirty && showSave && (
            <span className="text-xs text-amber-600">Unsaved changes</span>
          )}

          <div className="flex items-center gap-2">
            <ToggleProjectStatus
              id={project.id}
              isPublished={project.isPublished}
              onChanged={load}
            />
            <span className="text-xs text-muted-foreground">
              {project.isPublished ? "Live" : "Draft"}
            </span>
          </div>

          {showSave && (
            <Button onClick={handleSave} disabled={saving || !dirty}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          )}
        </div>
      </div>

      {/* ── Summary strip ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle className="text-2xl">{project.title}</CardTitle>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {project.category?.name ?? "Uncategorised"}
                </Badge>
                <LevelBadge level={project.level} />
                <SourceBadge source={project.source} />
                {project.source === "community" && (
                  <StatusBadge status={project.status} />
                )}
                {project.settings?.gateDownload === false && (
                  <Badge variant="outline" className="text-amber-600">
                    Ungated — link is public
                  </Badge>
                )}
              </div>

              {project.downloadUrl && (
                <a
                  href={project.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {project.downloadUrl}
                </a>
              )}
            </div>

            <div className="text-right">
              {/* People, not clicks. `downloadCount` is never rendered. */}
              <p className="flex items-center justify-end gap-1.5 text-2xl font-semibold">
                <Download className="h-5 w-5 text-muted-foreground" />
                {project.leadCount ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">people downloaded</p>
            </div>
          </div>

          {project.source === "community" && project.submitter?.email && (
            <div className="mt-4 rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Submitted by</p>
              <p className="text-muted-foreground">
                {project.submitter.name} · {project.submitter.email}
                {project.submitter.githubUrl && (
                  <>
                    {" · "}
                    <a
                      href={project.submitter.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      GitHub
                    </a>
                  </>
                )}
                {project.submitter.linkedinUrl && (
                  <>
                    {" · "}
                    <a
                      href={project.submitter.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      LinkedIn
                    </a>
                  </>
                )}
              </p>
              {project.submitter.note && (
                <p className="mt-2 italic text-muted-foreground">
                  “{project.submitter.note}”
                </p>
              )}

              {project.submittedGuideUrl && (
                <p className="mt-2">
                  <span className="text-muted-foreground">
                    Their write-up:{" "}
                  </span>
                  <a
                    href={project.submittedGuideUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {project.submittedGuideUrl}
                  </a>
                </p>
              )}
            </div>
          )}
        </CardHeader>
      </Card>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => changeTab(t)}
            className={
              tab === t
                ? "border-b-2 border-primary px-4 py-2 text-sm font-medium"
                : "px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            }
          >
            {t}
            {t === "Guide" && project.stepCount ? (
              <span className="ml-1.5 text-xs text-muted-foreground">
                {project.stepCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "Details" && (
        <Card>
          <CardContent className="pt-6">
            <DetailsFields
              values={values}
              onChange={handleChange}
              errors={errors}
              categories={categories}
              project={project}
            />
          </CardContent>
        </Card>
      )}

      {tab === "Guide" && (
        <GuideEditor projectId={project.id} onStepsChanged={load} />
      )}

      {tab === "Settings" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
              <p className="text-sm text-muted-foreground">
                Saved with the Save button above, alongside anything you changed
                on Details.
              </p>
            </CardHeader>
            <CardContent>
              <SettingsFields values={values} onChange={handleChange} />
            </CardContent>
          </Card>

          {/*
            The download email saves itself — it is its own record with its own
            override/revert, not part of the project row. Hence its own buttons
            rather than riding on the header Save.
          */}
          <EmailTemplateEditor projectId={project.id} />
        </div>
      )}

      {tab === "Leads" && (
        <Card>
          <CardHeader>
            <CardTitle>Who asked for this project</CardTitle>
            <p className="text-sm text-muted-foreground">
              One row per person, whichever door they came through. Somebody who
              came back on another device is still one row — the count above is
              people, not clicks.
            </p>
          </CardHeader>
          <CardContent>
            {leads.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nobody yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      {/*
                        Which gate they passed. Its own column because
                        "unlocked the guide but never downloaded" is the number
                        that says whether gating the guide earns anything or
                        just adds friction.
                      */}
                      <TableHead>Door</TableHead>
                      <TableHead className="text-right">Visits</TableHead>
                      <TableHead className="text-right">First seen</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {leads.map((lead) => {
                      const doors = [
                        lead.downloadedAt ? "Download" : null,
                        lead.guideUnlockedAt ? "Guide" : null,
                      ].filter(Boolean) as string[];

                      return (
                        <TableRow key={lead.id}>
                          <TableCell className="font-medium">
                            {lead.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {/* Not truncated: an email you cannot read in full
                                is an email you cannot follow up. */}
                            {lead.email}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {lead.countryCode ? `${lead.countryCode} ` : ""}
                            {lead.phone}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {doors.length === 0 ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                doors.map((door) => (
                                  <Badge key={door} variant="outline">
                                    {door}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {lead.submissionCount}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                            {new Date(lead.createdAt).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/*
        Renders nothing on a 403 by design, so a non-Super-Admin sees the page
        without a broken section. Deliberately not given a redirect.
      */}
      {tab === "Activity" && (
        <ActivityTimeline entityType="project" entityId={project.id} />
      )}
    </div>
  );
}
