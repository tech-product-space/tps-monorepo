"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";

import { projectService } from "@/gradient/services/projectService";
import { ProjectCategory } from "@/gradient/types/project";
import {
  DetailsFields,
  ProjectFormValues,
  emptyValues,
  slugify,
  toPayload,
  validateProject,
} from "./ProjectFormFields";

interface Props {
  categories: ProjectCategory[];
  onSuccess: () => void;
}

/**
 * Creating a project asks for the details and nothing else.
 *
 * **No settings here.** Every switch defaults to the sensible answer (gated
 * download, progress tracked, related rail on), and a new project is not live
 * yet — so nothing a switch controls has any effect between creating it and
 * opening it. Asking six questions before the admin has typed a title is how a
 * create form becomes something people avoid. They are on the Settings tab, one
 * click away, at the point they start mattering.
 */
export default function AddProject({ categories, onSuccess }: Props) {
  const router = useRouter();

  const [values, setValues] = useState<ProjectFormValues>(emptyValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /**
   * Once the admin edits the slug themselves, it stops following the title.
   *
   * Without this the field fights back: you fix a typo in the slug, type one
   * more character into the title, and your correction is overwritten.
   */
  const [slugTouched, setSlugTouched] = useState(false);

  const handleChange = <K extends keyof ProjectFormValues>(
    key: K,
    value: ProjectFormValues[K],
  ) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };

      // Auto-fill the slug from the title, into the field itself rather than as
      // a placeholder — an admin should be able to see and edit what will
      // actually be saved before they save it.
      if (key === "title" && !slugTouched) {
        next.slug = slugify(String(value));
      }

      return next;
    });
  };

  const handleCreate = async () => {
    const found = validateProject(values);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      const data = await projectService.createProject(toPayload(values) as any);

      if (!data.success) {
        toast.error(data.message || "Could not create the project");
        return;
      }

      toast.success("Project created — now write its guide");
      onSuccess();

      /**
       * Straight into the project rather than back to the list.
       *
       * A project cannot be published without at least one guide step, so
       * "created" is the middle of the job, not the end of it. Landing on the
       * list would leave the admin to find the row again and work out why the
       * publish toggle refuses.
       */
      router.push(`/projects/${data.data.id}?tab=Guide`);
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Could not create the project",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New project</CardTitle>
        <p className="text-sm text-muted-foreground">
          Just the basics. The guide and the settings come next, on the
          project&apos;s own page.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        <DetailsFields
          values={values}
          onChange={handleChange}
          errors={errors}
          categories={categories}
          autoSlug={!slugTouched}
          onSlugTouched={() => setSlugTouched(true)}
        />

        <Button onClick={handleCreate} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create project
        </Button>
      </CardContent>
    </Card>
  );
}
