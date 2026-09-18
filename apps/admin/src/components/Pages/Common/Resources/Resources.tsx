"use client";

import { useEffect, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteResource,
  getAllResources,
  resourcePublishStatus,
} from "@/services/resources/resourcesService";
import { AddResourceDialog } from "./AddResourceDialog";
import { useNotification } from "@/helpers/NotificationContext";

export const slugify = (title: string) => {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
};

const typeOptions = ["Ebooks", "Guides", "Templates", "AI Toolkit"] as const;
const categoryOptions = [
  "AI",
  "Product Management",
  "Software Development",
] as const;

export type ResourceType = (typeof typeOptions)[number];
export type ResourceCategory = (typeof categoryOptions)[number];

export interface IResource {
  id: number;
  title: string;
  subtitle: string;
  resourceType: string;
  resourceCategory: string;
  tagPrimary: string[];
  tagSecondary: string[];
  isPublished?: any;
  resourceSlug: string;
  thumbnail: string;
  createdAt?: any;
  updatedAt?: any;
}

export default function ResourcesPage() {
  const [selectedResource, setSelectedResource] = useState<IResource | null>(
    null
  );
  const [isAddResourceOpen, setIsAddResourceOpen] = useState(false);
  const [resources, setResources] = useState<IResource[]>([]);
  const router = useRouter();

  const handleResourceClick = (resource: IResource) => {
    setSelectedResource(resource);
  };

  const handleAddEvent = (newEvent: Omit<IResource, "id">) => {
    const resource: IResource = {
      ...newEvent,
      id: Date.now(),
    };
    setIsAddResourceOpen(false);
    setResources((prev) => [...prev, resource]);
  };

  const getAllResourcesFn = async () => {
    try {
      const response = await getAllResources();
      setResources(response);
    } catch (error) {
      console.error("Error fetching resources:", error);
    }
  };

  const handlePageRefresh = () => {
    getAllResourcesFn();
  };

  useEffect(() => {
    getAllResourcesFn();
  }, []);

  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="px-5 h-16 flex justify-between items-center border-b border-gray-200">
        <p className="text-lg font-semibold text-gray-900">Resources</p>
        <div className="flex items-center gap-4">
          <Button
            onClick={() => router.push("resources/subscribers")}
            className="px-4 py-2 text-sm font-medium cursor-pointer flex items-center gap-2"
          >
            Subscribers
          </Button>
          <Button
            onClick={() => router.push("resources/all-leads")}
            className="px-4 py-2 text-sm font-medium cursor-pointer flex items-center gap-2"
          >
            View All Leads
          </Button>

          <Dialog open={isAddResourceOpen} onOpenChange={setIsAddResourceOpen}>
            <DialogTrigger asChild>
              <Button className="px-4 py-2 text-sm font-medium cursor-pointer flex items-center gap-2">
                <Plus />
                Add Resource
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl sm:max-w-5xl md:max-w-5xl lg:max-w-5xl w-[95vw] sm:w-[800px] max-h-[95vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Resource</DialogTitle>
              </DialogHeader>
              <div className="p-4 text-center">
                <AddResourceDialog
                  onSubmit={handleAddEvent}
                  pageRefresh={handlePageRefresh}
                />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5 pb-10 bg-gray-50">
        <ResourcesTable
          resources={resources}
          onResourceClick={handleResourceClick}
          pageRefresh={handlePageRefresh}
        />
      </div>
    </div>
  );
}

function ResourcesTable({
  resources,
  onResourceClick,
  pageRefresh,
}: {
  resources: IResource[];
  onResourceClick: (resource: IResource) => void;
  pageRefresh: () => void;
}) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resourcePublish, setResourcePublish] = useState(false);
  const [selectedResourceStatus, setSelectedResourceStatus] = useState<
    boolean | null
  >(null);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(
    null
  );

  const { showNotification } = useNotification();

  const deleteResourceFn = async (id: string) => {
    try {
      const response = await deleteResource(id);
      console.log("Event deleted successfully:", response);
      if (response.result === "SUCCESS") {
        showNotification("success", "Event Deleted Successfully", "");
        setDeleteDialogOpen(false);
        pageRefresh();
      }
    } catch (error) {
      console.error("Error deleting event:", error);
    }
  };

  const publishResourceFn = async (resourceId: string, isPublish: boolean) => {
    try {
      const response = await resourcePublishStatus(resourceId, isPublish);
      pageRefresh();
      setResourcePublish(false);
    } catch (error) {
      console.error("Update failed:", error);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Resource</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>View</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {resources
            ?.slice()
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            )
            .map((resource) => (
              <TableRow
                key={resource.id}
                className="hover:bg-gray-50"
                onClick={() => onResourceClick(resource)}
              >
                <TableCell>
                  <div>
                    <div className="font-medium text-gray-900">
                      {resource.title}
                    </div>
                    {resource.subtitle && (
                      <div className="text-sm text-gray-500">
                        {resource.subtitle.split(" ").slice(0, 3).join(" ")}
                        {resource.subtitle.split(" ").length > 3 ? "..." : ""}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className="bg-blue-50 text-md text-blue-700 border-blue-200"
                  >
                    {resource.resourceType}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className="bg-blue-50 text-md text-blue-700 border-blue-200"
                  >
                    {resource.resourceCategory}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-sm cursor-pointer">
                    {resource?.isPublished ? (
                      <>
                        <p className="px-2 py-1 rounded-lg text-center w-[80px] bg-green-100 text-green-800 text-md">
                          Published
                        </p>
                        <Pencil
                          size={16}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setSelectedResourceId(resource.id.toString());
                            setSelectedResourceStatus(resource.isPublished);
                            setResourcePublish(true);
                          }}
                        />
                      </>
                    ) : (
                      <>
                        <p className="px-2 py-1 rounded-lg text-center w-[80px] bg-orange-100 text-orange-800 text-md">
                          Draft
                        </p>
                        <Pencil
                          size={16}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setSelectedResourceId(resource.id.toString());
                            setSelectedResourceStatus(resource.isPublished);
                            setResourcePublish(true);
                          }}
                        />
                      </>
                    )}
                  </div>
                </TableCell>

                <TableCell>
                  <Button
                    variant="outline"
                    onClick={() => {
                      window.open(
                        `https://staging-product-space-ui.vercel.app/resources/${resource.resourceSlug}`,
                        "_blank"
                      );
                    }}
                  >
                    View
                  </Button>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        router.push(`resources/manage/${resource.id}`);
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        router.push(`resources/edit/${resource.id}`);
                      }}
                      size="sm"
                      className="h-8 w-8 p-0 cursor-pointer"
                      aria-label="Edit Resource"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setSelectedResourceId(resource.id.toString());
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              resource.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedResourceId) deleteResourceFn(selectedResourceId);
              }}
              className="bg-destructive text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resourcePublish} onOpenChange={setResourcePublish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will {selectedResourceStatus ? "unpublish" : "publish"} the
              resource.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedResourceId !== null) {
                  publishResourceFn(
                    selectedResourceId,
                    !selectedResourceStatus
                  );
                }
              }}
              className={`text-white ${
                selectedResourceStatus
                  ? "bg-orange-600 hover:bg-orange-700"
                  : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {selectedResourceStatus ? "Draft" : "Publish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
