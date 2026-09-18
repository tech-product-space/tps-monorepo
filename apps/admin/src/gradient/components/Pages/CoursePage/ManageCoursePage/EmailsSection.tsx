"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/gradient/components/ui/card";
import { Badge } from "@/gradient/components/ui/badge";
import { courseService } from "@/gradient/services/courseService";
import { Course, CourseEmailTemplate } from "@/gradient/types/course";
import { COURSE_EMAIL_META, COURSE_EMAIL_ORDER } from "../constants";
import EmailTemplateDrawer from "./EmailTemplateDrawer";

export default function EmailsSection({ course }: { course: Course }) {
  const [templates, setTemplates] = useState<CourseEmailTemplate[]>([]);
  const [variables, setVariables] = useState<string[]>([]);
  const [brochureLink, setBrochureLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CourseEmailTemplate | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const response = await courseService.getEmailTemplates(course.id);
      setTemplates(response.data || []);
      setVariables(response.meta?.variables || []);
      setBrochureLink(response.meta?.brochureLink || "");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to load templates.");
    } finally {
      setLoading(false);
    }
  }, [course.id]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const ordered = COURSE_EMAIL_ORDER.map((type) =>
    templates.find((template) => template.type === type),
  ).filter(Boolean) as CourseEmailTemplate[];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Course Emails</CardTitle>
          <CardDescription>
            Each email can be edited, paused, and tested independently. A paused
            or unconfigured email is simply skipped — the lead is still recorded.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {ordered.map((template) => {
            const meta = COURSE_EMAIL_META[template.type];

            return (
              <button
                key={template.type}
                type="button"
                onClick={() => setEditing(template)}
                className="group flex w-full items-center gap-4 rounded-lg border-2 p-4 text-left transition-all hover:shadow-md"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Mail size={20} />
                </div>

                <div className="min-w-0 flex-grow">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{meta.label}</h3>

                    {!template.isConfigured ? (
                      <Badge variant="secondary">Not configured</Badge>
                    ) : template.isEnabled ? (
                      <Badge>Sending</Badge>
                    ) : (
                      <Badge variant="secondary">Paused</Badge>
                    )}
                  </div>

                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {template.subject || meta.description}
                  </p>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {editing && (
        <EmailTemplateDrawer
          // Remounts per template so the drawer's local state starts from the
          // right template rather than the previously opened one.
          key={editing.type}
          courseId={course.id}
          template={editing}
          variables={variables}
          brochureLink={brochureLink}
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={fetchTemplates}
        />
      )}
    </>
  );
}
