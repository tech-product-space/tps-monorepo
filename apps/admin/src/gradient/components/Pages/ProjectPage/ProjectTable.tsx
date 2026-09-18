"use client";

import { ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Edit,
  FolderGit2,
  Layers,
  Loader2,
  SearchX,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

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
import Pagination, { IPaginationMeta } from "@/gradient/components/ui/custom/Pagination";

import { projectService } from "@/gradient/services/projectService";
import { Project } from "@/gradient/types/project";
import { LevelBadge, SourceBadge, StatusBadge } from "./ProjectBadges";
import { ToggleProjectStatus } from "./ToggleProjectStatus";

interface Props {
  projects: Project[];
  fetchProjects: () => void;
  /** Delete needs its own hook: the page may have to step back a page. */
  onDeleted: () => void;
  fetchLoading: boolean;
  meta: IPaginationMeta;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  /** Changes the empty state from "none yet" to "none match" — a different fix. */
  hasFilters: boolean;
  filterBar: ReactNode;
}

export default function ProjectTable({
  projects,
  fetchProjects,
  onDeleted,
  fetchLoading,
  meta,
  onPageChange,
  onLimitChange,
  hasFilters,
  filterBar,
}: Props) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (project: Project) => {
    if (
      !window.confirm(
        `Delete "${project.title}"? Its guide steps go with it. This cannot be undone.`,
      )
    ) {
      return;
    }

    setDeletingId(project.id);
    try {
      const data = await projectService.deleteProject(project.id);

      if (data.success) {
        toast.success("Project deleted");
        onDeleted();
      } else {
        toast.error(data.message || "Could not delete the project");
      }
    } catch (error: any) {
      // The 409 for a project with downloads against it explains itself and
      // suggests unpublishing instead — surfacing it verbatim is the point.
      toast.error(
        error.response?.data?.message || "Could not delete the project",
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-4">
        <CardTitle className="flex items-center gap-2">
          <FolderGit2 className="h-5 w-5" />
          Projects
        </CardTitle>
        {filterBar}
      </CardHeader>

      <CardContent>
        {fetchLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <SearchX className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">
              {hasFilters ? "No projects match those filters" : "No projects yet"}
            </p>
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? "Try widening the search or clearing a filter."
                : "Add your first project to get the hub started."}
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Guide</TableHead>
                  {/*
                    Labelled Downloads, and it is `leadCount` — people, not
                    clicks. `downloadCount` counts gate passes and is never
                    rendered; see the backend model.
                  */}
                  <TableHead className="text-right">Downloads</TableHead>
                  <TableHead>Live</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell>
                      <button
                        onClick={() => router.push(`/projects/${project.id}`)}
                        className="text-left font-medium hover:underline"
                      >
                        {project.title}
                      </button>
                      {project.source === "community" &&
                        project.status !== "approved" && (
                          <div className="mt-1">
                            <StatusBadge status={project.status} />
                          </div>
                        )}
                    </TableCell>

                    <TableCell>
                      {project.category?.name ?? (
                        <span className="text-muted-foreground">
                          Uncategorised
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      <LevelBadge level={project.level} />
                    </TableCell>

                    <TableCell>
                      <SourceBadge source={project.source} />
                    </TableCell>

                    <TableCell>
                      <span
                        className={
                          project.stepCount
                            ? "flex items-center gap-1.5 text-sm"
                            : "flex items-center gap-1.5 text-sm text-amber-600"
                        }
                        // A project cannot be published without a step, so zero
                        // here is the reason the publish toggle will refuse.
                        title={
                          project.stepCount
                            ? undefined
                            : "This project has no guide steps yet — it cannot be published."
                        }
                      >
                        <Layers className="h-3.5 w-3.5" />
                        {project.stepCount ?? 0}
                      </span>
                    </TableCell>

                    <TableCell className="text-right">
                      <span className="flex items-center justify-end gap-1.5">
                        <Download className="h-3.5 w-3.5 text-muted-foreground" />
                        {project.leadCount ?? 0}
                      </span>
                    </TableCell>

                    <TableCell>
                      <ToggleProjectStatus
                        id={project.id}
                        isPublished={project.isPublished}
                        onChanged={fetchProjects}
                      />
                    </TableCell>

                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            router.push(`/projects/${project.id}?tab=Details`)
                          }
                          aria-label="Edit project"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deletingId === project.id}
                          onClick={() => handleDelete(project)}
                          aria-label="Delete project"
                        >
                          {deletingId === project.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination
              meta={meta}
              onPageChange={onPageChange}
              onLimitChange={onLimitChange}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
