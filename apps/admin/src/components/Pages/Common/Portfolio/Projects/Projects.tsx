"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { HoverLoading } from "@/components/Common/Loading/HoverLoading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useNotification } from "@/helpers/NotificationContext";
import Image from "next/image";
import {
  deleteProject,
  getProjectUsers,
} from "@/services/project/projectServices";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Edit, Trash2, Plus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

export interface PortfolioProject {
  id: string;
  userId: string | null;
  projectName: string;
  description: string;
  problemStatement: string;
  goals: string;
  skills: string;
  tools: string;
  tag: string;
  mediaUrl: string;
  documentUrl: string;
  projectLink: string;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
}

export default function Projects() {
  const { showNotification } = useNotification();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPrivate, setIsPrivate] = useState(true);

  const getAllProjects = async (privateOnly: boolean) => {
    setIsLoading(true);
    try {
      const response = await getProjectUsers(true);
      if (response) {
        setProjects(response);
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
      showNotification("error", "Fetch Failed", "Failed to fetch projects.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (projectId: string) => {
    router.push(`projects/edit/${projectId}`);
  };


  const handleRemove = async (projectId: string, projectName: string) => {
    try {
      const response = await deleteProject(projectId);
      if (response.message == "Portfolio project deleted successfully") {
        showNotification(
          "success",
          "Success",
          `"${projectName}" deleted successfully.`
        );
        getAllProjects(isPrivate);
      }
    } catch (error) {
      console.error("Error deleting project:", error);
      showNotification("error", "Delete Failed", "Failed to delete project.");
    }
  };

  const handleAddNew = () => {
    router.push("projects/internal-project/new");
  };

  useEffect(() => {
    getAllProjects(isPrivate);
  }, [isPrivate]);

  useEffect(() => {
    const isInternalParam = searchParams.has("internal");
    setIsPrivate(!isInternalParam);
    getAllProjects(!isInternalParam);
  }, [searchParams]);

  return (
    <div className="flex flex-col h-screen">
      <div className="px-5 h-16 flex justify-between items-center border-b">
        <div className="flex items-center gap-2">
          <SidebarTrigger size={"lg"} />
          <p className="text-lg font-semibold">Projects</p>
        </div>
      </div>

      {isLoading ? (
        <HoverLoading title="Fetching projects ..." />
      ) : (
        <div className="flex flex-col h-full flex-1 overflow-auto p-5 pb-10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Tag</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length > 0 ? (
                projects.map((project) => (
                  <TableRow
                    key={project.id}
                    className="cursor-pointer hover:bg-gray-100"
                    onClick={() =>
                      window.open(
                        `https://theproductspace.in/projects/${project.id}`
                      )
                    }
                  >
                    <TableCell className="flex items-center gap-3">
                      <Image
                        src={
                          project.mediaUrl || "https://via.placeholder.com/40"
                        }
                        alt={project.projectName}
                        width={40}
                        height={40}
                        className="h-[40px] w-[40px] rounded object-cover"
                      />
                      <span>{project.projectName}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm px-2 py-1 bg-blue-100 rounded">
                        {project.tag}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(project.id);
                          }}
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="h-4 w-4" />
                          <span className="sr-only">Edit project</span>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete project</span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete "{project.projectName}"?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. Are you sure you
                                want to permanently delete this project?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                              >
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 text-white hover:bg-red-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemove(project.id, project.projectName);
                                }}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-6">
                    No projects found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
