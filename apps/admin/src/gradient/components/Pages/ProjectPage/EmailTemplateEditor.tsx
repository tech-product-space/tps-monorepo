"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";

import EmailEditor from "@/gradient/components/ui/EmailEditor/EmailEditor";
import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Switch } from "@/gradient/components/ui/switch";

import { projectService } from "@/gradient/services/projectService";
import { ProjectEmailResolution, ProjectEmailType } from "@/gradient/types/project";

/**
 * The copy that frames each editor, and the tags to fall back on if the API's
 * list has not arrived yet.
 *
 * `submissionAck` has no per-project variant: the project it is about did not
 * exist until the moment it was sent, so nobody could have written an override
 * for it. The page that mounts it never passes a `projectId`.
 */
const COPY: Record<
  ProjectEmailType,
  {
    title: string;
    globalTitle: string;
    blurb: string;
    globalBlurb: string;
    subjectPlaceholder: string;
    fallbackFields: string[];
  }
> = {
  downloadDelivery: {
    title: "Download email",
    globalTitle: "Global download email",
    blurb: "Sent when somebody passes this project's download gate.",
    globalBlurb:
      "Sent after every project download, unless a project overrides it.",
    subjectPlaceholder: "Your {{projectTitle}} project files",
    fallbackFields: ["name", "projectTitle", "downloadUrl", "projectUrl"],
  },
  submissionAck: {
    title: "Submission acknowledgement",
    globalTitle: "Submission acknowledgement",
    blurb: "Sent to a contributor when their project is received.",
    globalBlurb:
      "Sent the moment somebody submits a project. It confirms we have it — it must not read as though the project is live.",
    subjectPlaceholder: "We have your project — {{projectTitle}}",
    fallbackFields: ["name", "projectTitle", "projectLink"],
  },
};

interface Props {
  /** Absent = editing the global default. Present = editing that project's override. */
  projectId?: string;
  /** Which email. Defaults to the download one, the only per-project type. */
  type?: ProjectEmailType;
}

/**
 * One editor, two mount points — the payoff of the global and the override
 * being rows in the same table.
 *
 * On a project, the screen has to answer "is this project using the global, or
 * its own copy?" before anything else, because that is what an admin came here
 * to find out. When inheriting, the global's copy is shown **read-only** rather
 * than as an empty box: an empty box reads as "no email is sent", which is the
 * opposite of what is happening.
 *
 * The body is `EmailEditor` — inline-styled HTML for Outlook. Not `TiptapEditor`
 * (ProseMirror JSON, for guides) and not `RichTextEditor` (plain prose HTML).
 * Pick by output shape.
 */
export default function EmailTemplateEditor({
  projectId,
  type = "downloadDelivery",
}: Props) {
  const [resolution, setResolution] = useState<ProjectEmailResolution | null>(
    null,
  );
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [overriding, setOverriding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (projectId) {
        const data = await projectService.getProjectEmailTemplate(
          projectId,
          type,
        );
        if (data.success) {
          setResolution(data.data);
          const active = data.data.override ?? data.data.global;
          setSubject(active?.subject ?? "");
          setBody(active?.body ?? "");
          setIsEnabled(active?.isEnabled ?? true);
          setOverriding(Boolean(data.data.override));
        }
      } else {
        const data = await projectService.getGlobalEmailTemplate(type);
        if (data.success) {
          setSubject(data.data.template?.subject ?? "");
          setBody(data.data.template?.body ?? "");
          setIsEnabled(data.data.template?.isEnabled ?? true);
        }
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not load the template");
    } finally {
      setLoading(false);
    }
  }, [projectId, type]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("A subject and a body are both required");
      return;
    }

    setSaving(true);
    try {
      const data = projectId
        ? await projectService.saveProjectEmailTemplate(projectId, type, {
            subject,
            body,
            isEnabled,
          })
        : await projectService.saveGlobalEmailTemplate(type, {
            subject,
            body,
            isEnabled,
          });

      if (data.success) {
        toast.success("Template saved");
        load();
      } else {
        toast.error(data.message || "Could not save the template");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not save the template");
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async () => {
    if (
      !projectId ||
      !window.confirm(
        "Remove this project's own email and go back to the global template?",
      )
    ) {
      return;
    }

    try {
      const data = await projectService.deleteProjectEmailTemplate(
        projectId,
        type,
      );
      if (data.success) {
        toast.success(data.message);
        load();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not revert");
    }
  };

  const handleTest = async () => {
    if (!testTo.trim()) {
      toast.error("Where should the test go?");
      return;
    }

    setTesting(true);
    try {
      const data = await projectService.sendTestEmail(type, {
        to: testTo.trim(),
        projectId,
      });

      if (data.data?.sent) toast.success(`Test sent to ${testTo}`);
      else toast.error(data.data?.error || "The test could not be sent");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "The test could not be sent");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const inheriting = Boolean(projectId) && !overriding;
  const copy = COPY[type];
  const mergeFields = resolution?.mergeFields ?? copy.fallbackFields;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {projectId ? copy.title : copy.globalTitle}
          </CardTitle>

          {projectId &&
            (inheriting ? (
              <Badge variant="outline" className="text-muted-foreground">
                Using the global template
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-violet-200 bg-violet-50 text-violet-700"
              >
                Overridden for this project
              </Badge>
            ))}
        </div>

        <p className="text-sm text-muted-foreground">
          {projectId ? copy.blurb : copy.globalBlurb}
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {inheriting && (
          <div className="rounded-lg border border-dashed bg-muted/40 p-4">
            <p className="text-sm">
              This project uses the global template. Edit below and save to give
              it its own copy — the global stays untouched.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label>Subject</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={copy.subjectPlaceholder}
          />
        </div>

        <div className="space-y-2">
          <Label>Body</Label>
          <EmailEditor value={body} onChange={setBody} />
        </div>

        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-xs font-medium">Merge fields</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {mergeFields.map((field) => (
              <code
                key={field}
                className="rounded bg-background px-1.5 py-0.5 text-xs"
              >
                {`{{${field}}}`}
              </code>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            An unknown tag is left as written rather than blanked — a visible{" "}
            <code>{"{{typo}}"}</code> in a test send is easier to spot than an
            empty space.
          </p>
        </div>

        <div className="flex items-start justify-between gap-6 rounded-lg border p-4">
          <div>
            <Label>Send this email</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              {projectId
                ? "Off means no email for this project, even when the global is on."
                : "Off means no project sends a download email unless it overrides this."}
            </p>
          </div>
          <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {inheriting ? "Save as an override" : "Save template"}
          </Button>

          {projectId && overriding && (
            <Button variant="outline" onClick={handleRevert}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Revert to global
            </Button>
          )}

          <div className="ml-auto flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Send a test to</Label>
              <Input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="you@theproductspace.co.in"
                className="w-[240px]"
              />
            </div>
            <Button variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Test
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          A test uses a placeholder download link, never the real one — a test
          goes to whatever address is typed above.
        </p>
      </CardContent>
    </Card>
  );
}
