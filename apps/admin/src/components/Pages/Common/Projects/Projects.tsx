"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

import {
  deleteInternalProject,
  getInternalProject,
} from "@/services/project/projectServices";

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
  projectTitle: string;
}

interface EditProjectPageProps {
  id?: string;
}
export default function Projects() {
  const { showNotification } = useNotification();
  const router = useRouter();
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const getAllInternalProjects = async () => {
    setIsLoading(true);
    try {
      const response = await getInternalProject();
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
      const response = await deleteInternalProject(projectId);
      if (response.message == "Portfolio project deleted successfully") {
        showNotification(
          "success",
          "Success",
          `"${projectName}" deleted successfully.`
        );
      }
      await getAllInternalProjects();
    } catch (error) {
      console.error("Error deleting project:", error);
      showNotification("error", "Delete Failed", "Failed to delete project.");
    }
  };

  const handleAddNew = () => {
    router.push("/superadmin/projects/new");
  };

  useEffect(() => {
    getAllInternalProjects();
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <div className="px-5 h-16 flex justify-between items-center border-b">
        <div className="flex items-center gap-2">
          <SidebarTrigger size={"lg"} />
          <p className="text-lg font-semibold">Projects</p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            onClick={handleAddNew}
            size="sm"
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add New
          </Button>
        </div>
      </div>

      {isLoading ? (
        <HoverLoading title="Fetching projects ..." />
      ) : (
        <div className="flex flex-col h-full flex-1 overflow-auto p-5 pb-10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
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
                        `https://staging-product-space-ui.vercel.app/internal-projects/${project.id}`
                      )
                    }
                  >
                    <TableCell className="flex items-center gap-3">
                      <span>{project.projectTitle}</span>
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
                          className="h-8 w-8 p-0 cursor-pointer" 
                        >
                          <Edit className="h-4 w-4"  />
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
                                Delete "{project.projectTitle}"?
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
                                  handleRemove(
                                    project.id,
                                    project.projectTitle
                                  );
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
