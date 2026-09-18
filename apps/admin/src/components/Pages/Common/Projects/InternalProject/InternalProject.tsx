"use client";

import type React from "react";

import { useEffect, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import TiptapEditor from "@/components/Pages/Common/SimpleEditor/SimpleEditor";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  getInternalProjectById,
  postInternalProject,
} from "@/services/project/projectServices";
import { usePathname, useRouter } from "next/navigation";

// Zod schema for form validation
const projectSchema = z.object({
  projectName: z.object({
    title: z.string().min(1, "Project name title is required"),
    content: z.string().min(1, "Project name content is required"),
  }),
  teamMembers: z.object({
    title: z.string().min(1, "Team members title is required"),
    teamMembers: z
      .array(
        z.object({
          name: z.string().min(1, "Team member name is required"),
          designation: z.string().min(1, "Designation is required"),
          image: z
            .string()
            .url("Please enter a valid image URL")
            .optional()
            .or(z.literal("")),
          linkedIn: z
            .string()
            .url("Please enter a valid LinkedIn URL")
            .optional()
            .or(z.literal("")),
        })
      )
      .min(1, "At least one team member is required"),
  }),
  videoUrl: z.object({
    title: z.string().min(1, "Video URL title is required"),
    content: z
      .string()
      .url("Please enter a valid video URL")
      .optional()
      .or(z.literal("")),
  }),
  thumbnailUrl: z.object({
    url: z.string().min(1, "Thumbnail URL is required"),
  }),
  tryNowUrl: z.object({
    title: z.string().min(1, "Try Now URL title is required"),
    content: z
      .string()
      .url("Please enter a valid URL")
      .optional()
      .or(z.literal("")),
  }),
  productOpportunity: z.object({
    title: z.string().min(1, "Product opportunity title is required"),
    content: z
      .array(
        z.object({
          type: z.enum(["paragraph", "image"]),
          content: z.string().min(1, "Content is required"),
        })
      )
      .min(1, "At least one content block is required"),
  }),
  solutionAndKeyFeatures: z.object({
    title: z.string().min(1, "Solution title is required"),
    content: z
      .array(
        z.object({
          type: z.enum(["paragraph", "image"]),
          content: z.string().min(1, "Content is required"),
        })
      )
      .min(1, "At least one content block is required"),
  }),
  techStack: z.object({
    title: z.string().min(1, "Tech stack title is required"),
    content: z.string().optional(),
    image: z
      .string()
      .url("Please enter a valid image URL")
      .optional()
      .or(z.literal("")),
  }),
  howItWorks: z.object({
    title: z.string().min(1, "How it works title is required"),
    content: z
      .array(
        z.object({
          type: z.enum(["paragraph", "image"]),
          content: z.string().min(1, "Content is required"),
        })
      )
      .min(1, "At least one content block is required"),
  }),
  timeToBuild: z.object({
    title: z.string().min(1, "Time to build title is required"),
    content: z.string().min(1, "Time to build content is required"),
  }),
});

export type ProjectFormData = z.infer<typeof projectSchema>;

interface EditProjectPageProps {
  id?: string;
}

export default function NewProject({ id }: EditProjectPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(!!id); // Only show loading if we have an id
  const [initialData, setInitialData] = useState<Partial<ProjectFormData>>({});

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      projectName: { title: "", content: "" },
      teamMembers: {
        title: "",
        teamMembers: [{ name: "", designation: "", image: "", linkedIn: "" }],
      },
      videoUrl: { title: "", content: "" },
      thumbnailUrl: { url: "" },
      tryNowUrl: { title: "", content: "" },
      productOpportunity: {
        title: "",
        content: [{ type: "paragraph", content: "" }],
      },
      solutionAndKeyFeatures: {
        title: "",
        content: [{ type: "paragraph", content: "" }],
      },
      techStack: { title: "", content: "", image: "" },
      howItWorks: { title: "", content: [{ type: "paragraph", content: "" }] },
      timeToBuild: { title: "", content: "" },
    },
  });

  const {
    fields: teamFields,
    append: appendTeam,
    remove: removeTeam,
  } = useFieldArray({
    control,
    name: "teamMembers.teamMembers",
  });

  const {
    fields: contentFields,
    append: appendContent,
    remove: removeContent,
  } = useFieldArray({
    control,
    name: "productOpportunity.content",
  });

  const {
    fields: solutionFields,
    append: appendSolution,
    remove: removeSolution,
  } = useFieldArray({
    control,
    name: "solutionAndKeyFeatures.content",
  });

  const {
    fields: howItWorksFields,
    append: appendHowItWorks,
    remove: removeHowItWorks,
  } = useFieldArray({
    control,
    name: "howItWorks.content",
  });

  const fetchProjectData = async () => {
    if (id) {
      setIsLoading(true);
      try {
        const projectData = await getInternalProjectById(id);
        setInitialData(projectData.formData);
        reset(projectData.formData);
        console.log("Fetched project data:", projectData.formData);
      } catch (error) {
        console.error("Error fetching project:", error);
        alert("Failed to fetch project data.");
      } finally {
        setIsLoading(false);
      }
    } else {
      // If no id, we're creating a new project, so no loading needed
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [id]);

  const onSubmit = async (data: ProjectFormData) => {
    setIsSubmitting(true);
    console.clear();
    const submissionLog = {
      id,
      projectName: data.projectName,
      teamMembers: data.teamMembers,
      videoUrl: data.videoUrl,
      thumbnailUrl: data.thumbnailUrl,
      tryNowUrl: data.tryNowUrl,
      productOpportunity: data.productOpportunity,
      solutionAndKeyFeatures: data.solutionAndKeyFeatures,
      techStack: data.techStack,
      howItWorks: data.howItWorks,
      timeToBuild: data.timeToBuild,
    };
    console.log("🧾 Submission Log ---> :", submissionLog);

    try {
      const response = await postInternalProject(submissionLog);
      alert(
        id ? "Project updated successfully!" : "Project created successfully!"
      );
      console.log(response);

      const isSuperAdmin = pathname.includes("/superadmin");
      const basePath = isSuperAdmin ? "/superadmin" : "/admin";
      router.push(`${basePath}/projects`);
    } catch (error) {
      console.error("Error submitting project:", error);
      alert(
        `Something went wrong while ${
          id ? "updating" : "creating"
        } the project.`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const addTeamMember = () => {
    appendTeam({ name: "", designation: "", image: "", linkedIn: "" });
  };

  const removeTeamMember = (index: number) => {
    if (teamFields.length > 1) {
      removeTeam(index);
    }
  };

  const addContentBlock = (type: "paragraph" | "image") => {
    appendContent({ type, content: "" });
  };

  const removeContentBlock = (index: number) => {
    if (contentFields.length > 1) {
      removeContent(index);
    }
  };

  const handleCancelClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const isSuperAdmin = pathname.includes("/superadmin");
    const basePath = isSuperAdmin ? "/superadmin" : "/admin";
    router.push(`${basePath}/projects`);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="h-screen bg-[#FFFFFF] overflow-y-auto">
        <div className="px-5 h-16 flex justify-between items-center border-b">
          <div className="flex items-center gap-2">
            <SidebarTrigger size={"lg"} />
            <p className="text-lg font-semibold">
              {id ? "Loading Project..." : "Create New Project"}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading project data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#FFFFFF] overflow-y-auto">
      <div className="px-5 h-16 flex justify-between items-center border-b">
        <div className="flex items-center gap-2">
          <SidebarTrigger size={"lg"} />
          <p className="text-lg font-semibold">
            {id ? "Edit Project" : "Create New Project"}
          </p>
        </div>
      </div>
      <div className="mx-auto">
        <Card className="border-0">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">
              Project Information Form
            </CardTitle>
            <CardDescription>
              Fill out titles and content for all project details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
              {/* Project Name */}
              <div className="space-y-4 p-4 border rounded-lg bg-[#FFFFFF]">
                <h3 className="font-semibold text-lg">Project Name</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="projectName.title"
                      className="text-sm font-medium"
                    >
                      Title
                    </Label>
                    <Input
                      id="projectName.title"
                      {...register("projectName.title")}
                      placeholder="e.g., Project Name"
                      className={
                        errors.projectName?.title ? "border-red-500" : ""
                      }
                    />
                    {errors.projectName?.title && (
                      <p className="text-sm text-red-500">
                        {errors.projectName.title.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="projectName.content"
                      className="text-sm font-medium"
                    >
                      Content
                    </Label>
                    <Input
                      id="projectName.content"
                      {...register("projectName.content")}
                      placeholder="Enter your project name"
                      className={
                        errors.projectName?.content ? "border-red-500" : ""
                      }
                    />
                    {errors.projectName?.content && (
                      <p className="text-sm text-red-500">
                        {errors.projectName.content.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Team Members */}
              <div className="space-y-4 p-4 border rounded-lg bg-[#FFFFFF]">
                <div className="space-y-2">
                  <Label
                    htmlFor="teamMembers.title"
                    className="text-sm font-medium"
                  >
                    Team Members Section Title
                  </Label>
                  <Input
                    id="teamMembers.title"
                    {...register("teamMembers.title")}
                    placeholder="e.g., Our Team"
                    className={
                      errors.teamMembers?.title ? "border-red-500" : ""
                    }
                  />
                  {errors.teamMembers?.title && (
                    <p className="text-sm text-red-500">
                      {errors.teamMembers.title.message}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">Team Members</h3>
                  <Button
                    type="button"
                    onClick={addTeamMember}
                    size="sm"
                    variant="outline"
                    className="flex items-center gap-2 bg-transparent"
                  >
                    <Plus className="h-4 w-4" />
                    Add Member
                  </Button>
                </div>
                {teamFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="space-y-4 p-4 border rounded bg-white"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Team Member {index + 1}</h4>
                      {teamFields.length > 1 && (
                        <Button
                          type="button"
                          onClick={() => removeTeamMember(index)}
                          size="sm"
                          variant="outline"
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Name</Label>
                        <Input
                          {...register(`teamMembers.teamMembers.${index}.name`)}
                          placeholder="Team member name"
                          className={
                            errors.teamMembers?.teamMembers?.[index]?.name
                              ? "border-red-500"
                              : ""
                          }
                        />
                        {errors.teamMembers?.teamMembers?.[index]?.name && (
                          <p className="text-sm text-red-500">
                            {
                              errors.teamMembers.teamMembers[index]?.name
                                ?.message
                            }
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          Designation
                        </Label>
                        <Input
                          {...register(
                            `teamMembers.teamMembers.${index}.designation`
                          )}
                          placeholder="e.g., Frontend Developer"
                          className={
                            errors.teamMembers?.teamMembers?.[index]
                              ?.designation
                              ? "border-red-500"
                              : ""
                          }
                        />
                        {errors.teamMembers?.teamMembers?.[index]
                          ?.designation && (
                          <p className="text-sm text-red-500">
                            {
                              errors.teamMembers.teamMembers[index]?.designation
                                ?.message
                            }
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          Image URL (Optional)
                        </Label>
                        <Input
                          {...register(
                            `teamMembers.teamMembers.${index}.image`
                          )}
                          placeholder="Profile image URL"
                          className={
                            errors.teamMembers?.teamMembers?.[index]?.image
                              ? "border-red-500"
                              : ""
                          }
                        />
                        {errors.teamMembers?.teamMembers?.[index]?.image && (
                          <p className="text-sm text-red-500">
                            {
                              errors.teamMembers.teamMembers[index]?.image
                                ?.message
                            }
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          LinkedIn URL (Optional)
                        </Label>
                        <Input
                          {...register(
                            `teamMembers.teamMembers.${index}.linkedIn`
                          )}
                          placeholder="LinkedIn profile URL"
                          className={
                            errors.teamMembers?.teamMembers?.[index]?.linkedIn
                              ? "border-red-500"
                              : ""
                          }
                        />
                        {errors.teamMembers?.teamMembers?.[index]?.linkedIn && (
                          <p className="text-sm text-red-500">
                            {
                              errors.teamMembers.teamMembers[index]?.linkedIn
                                ?.message
                            }
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Thumbnail URL */}
              <div className="space-y-4 p-4 border rounded-lg bg-[#FFFFFF]">
                <h3 className="font-semibold text-lg">Thumbnail URL</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="thumbnailUrl.title"
                      className="text-sm font-medium"
                    >
                      Url
                    </Label>
                    <Input
                      id="thumbnailUrl.title"
                      {...register("thumbnailUrl.url")}
                      placeholder="e.g., Demo Thumbnail"
                      className={
                        errors.thumbnailUrl?.url ? "border-red-500" : ""
                      }
                    />
                    {errors.thumbnailUrl?.url && (
                      <p className="text-sm text-red-500">
                        {errors.thumbnailUrl.url.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Video URL */}
              <div className="space-y-4 p-4 border rounded-lg bg-[#FFFFFF]">
                <h3 className="font-semibold text-lg">Video URL</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="videoUrl.title"
                      className="text-sm font-medium"
                    >
                      Title
                    </Label>
                    <Input
                      id="videoUrl.title"
                      {...register("videoUrl.title")}
                      placeholder="e.g., Demo Video"
                      className={errors.videoUrl?.title ? "border-red-500" : ""}
                    />
                    {errors.videoUrl?.title && (
                      <p className="text-sm text-red-500">
                        {errors.videoUrl.title.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="videoUrl.content"
                      className="text-sm font-medium"
                    >
                      URL
                    </Label>
                    <Input
                      id="videoUrl.content"
                      {...register("videoUrl.content")}
                      placeholder="Enter video URL"
                      className={
                        errors.videoUrl?.content ? "border-red-500" : ""
                      }
                    />
                    {errors.videoUrl?.content && (
                      <p className="text-sm text-red-500">
                        {errors.videoUrl.content.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Try Now URL */}
              <div className="space-y-4 p-4 border rounded-lg bg-[#FFFFFF]">
                <h3 className="font-semibold text-lg">Try Now URL</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="tryNowUrl.title"
                      className="text-sm font-medium"
                    >
                      Title
                    </Label>
                    <Input
                      id="tryNowUrl.title"
                      {...register("tryNowUrl.title")}
                      placeholder="e.g., Try Now"
                      className={
                        errors.tryNowUrl?.title ? "border-red-500" : ""
                      }
                    />
                    {errors.tryNowUrl?.title && (
                      <p className="text-sm text-red-500">
                        {errors.tryNowUrl.title.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="tryNowUrl.content"
                      className="text-sm font-medium"
                    >
                      URL
                    </Label>
                    <Input
                      id="tryNowUrl.content"
                      {...register("tryNowUrl.content")}
                      placeholder="Enter try now URL"
                      className={
                        errors.tryNowUrl?.content ? "border-red-500" : ""
                      }
                    />
                    {errors.tryNowUrl?.content && (
                      <p className="text-sm text-red-500">
                        {errors.tryNowUrl.content.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Product Opportunity - Updated Section */}
              <div className="space-y-4 p-4 border rounded-lg bg-[#FFFFFF]">
                <div className="space-y-2">
                  <Label
                    htmlFor="productOpportunity.title"
                    className="text-sm font-medium"
                  >
                    Product Opportunity Title
                  </Label>
                  <Input
                    id="productOpportunity.title"
                    {...register("productOpportunity.title")}
                    placeholder="e.g., Market Opportunity"
                    className={
                      errors.productOpportunity?.title ? "border-red-500" : ""
                    }
                  />
                  {errors.productOpportunity?.title && (
                    <p className="text-sm text-red-500">
                      {errors.productOpportunity.title.message}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">
                    Product Opportunity Content
                  </h3>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => addContentBlock("paragraph")}
                      size="sm"
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Paragraph
                    </Button>
                    <Button
                      type="button"
                      onClick={() => addContentBlock("image")}
                      size="sm"
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Image
                    </Button>
                  </div>
                </div>
                {contentFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="space-y-4 p-4 border rounded bg-white"
                  >
                    <div className="space-y-2">
                      {watch(`productOpportunity.content.${index}.type`) ===
                      "paragraph" ? (
                        <>
                          <div className="flex w-full justify-between items-center">
                            <Label className="text-sm font-medium">
                              Paragraph Content
                            </Label>
                            {contentFields.length > 1 && (
                              <Button
                                type="button"
                                onClick={() => removeContentBlock(index)}
                                size="sm"
                                variant="outline"
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <Controller
                            name={`productOpportunity.content.${index}.content`}
                            control={control}
                            render={({ field }) => (
                              <TiptapEditor
                                placeholder="Please write a detailed description"
                                content={field.value || ""}
                                onChange={field.onChange}
                                className="w-full"
                              />
                            )}
                          />
                        </>
                      ) : (
                        <>
                          <div className="flex w-full justify-between items-center">
                            <Label className="text-sm font-medium">
                              Image URL
                            </Label>
                            {contentFields.length > 1 && (
                              <Button
                                type="button"
                                onClick={() => removeContentBlock(index)}
                                size="sm"
                                variant="outline"
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <Input
                            {...register(
                              `productOpportunity.content.${index}.content`
                            )}
                            placeholder="Enter image URL"
                            className={
                              errors.productOpportunity?.content?.[index]
                                ?.content
                                ? "border-red-500"
                                : ""
                            }
                          />
                        </>
                      )}
                      {errors.productOpportunity?.content?.[index]?.content && (
                        <p className="text-sm text-red-500">
                          {
                            errors.productOpportunity.content[index]?.content
                              ?.message
                          }
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Solution and Key Features */}
              <div className="space-y-4 p-4 border rounded-lg bg-[#FFFFFF]">
                <div className="space-y-2">
                  <Label
                    htmlFor="solutionAndKeyFeatures.title"
                    className="text-sm font-medium"
                  >
                    Title
                  </Label>
                  <Input
                    id="solutionAndKeyFeatures.title"
                    {...register("solutionAndKeyFeatures.title")}
                    placeholder="e.g., Our Solution"
                    className={
                      errors.solutionAndKeyFeatures?.title
                        ? "border-red-500"
                        : ""
                    }
                  />
                  {errors.solutionAndKeyFeatures?.title && (
                    <p className="text-sm text-red-500">
                      {errors.solutionAndKeyFeatures.title.message}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">Solution Content</h3>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() =>
                        appendSolution({ type: "paragraph", content: "" })
                      }
                      size="sm"
                      variant="outline"
                    >
                      <Plus className="h-4 w-4" />
                      Add Paragraph
                    </Button>
                    <Button
                      type="button"
                      onClick={() =>
                        appendSolution({ type: "image", content: "" })
                      }
                      size="sm"
                      variant="outline"
                    >
                      <Plus className="h-4 w-4" />
                      Add Image
                    </Button>
                  </div>
                </div>
                {solutionFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="space-y-4 p-4 border rounded bg-white"
                  >
                    <div className="space-y-2">
                      {watch(`solutionAndKeyFeatures.content.${index}.type`) ===
                      "paragraph" ? (
                        <>
                          <div className="flex w-full justify-between items-center">
                            <Label className="text-sm font-medium">
                              Paragraph Content
                            </Label>
                            {solutionFields.length > 1 && (
                              <Button
                                type="button"
                                onClick={() => removeSolution(index)}
                                size="sm"
                                variant="outline"
                                className="text-red-500"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <Controller
                            name={`solutionAndKeyFeatures.content.${index}.content`}
                            control={control}
                            render={({ field }) => (
                              <TiptapEditor
                                placeholder="Enter paragraph..."
                                content={field.value || ""}
                                onChange={field.onChange}
                                className="w-full"
                              />
                            )}
                          />
                        </>
                      ) : (
                        <>
                          <div className="flex w-full justify-between items-center">
                            <Label className="text-sm font-medium">
                              Image URL
                            </Label>
                            {solutionFields.length > 1 && (
                              <Button
                                type="button"
                                onClick={() => removeSolution(index)}
                                size="sm"
                                variant="outline"
                                className="text-red-500"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <Input
                            {...register(
                              `solutionAndKeyFeatures.content.${index}.content`
                            )}
                            placeholder="Enter image URL"
                            className={
                              errors.solutionAndKeyFeatures?.content?.[index]
                                ?.content
                                ? "border-red-500"
                                : ""
                            }
                          />
                        </>
                      )}
                      {errors.solutionAndKeyFeatures?.content?.[index]
                        ?.content && (
                        <p className="text-sm text-red-500">
                          {
                            errors.solutionAndKeyFeatures.content[index]
                              ?.content?.message
                          }
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Tech Stack */}
              <div className="space-y-4 p-4 border rounded-lg bg-[#FFFFFF]">
                <h3 className="font-semibold text-lg">Tech Stack</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="techStack.title"
                      className="text-sm font-medium"
                    >
                      Title
                    </Label>
                    <Input
                      id="techStack.title"
                      {...register("techStack.title")}
                      placeholder="e.g., Technology Stack"
                      className={
                        errors.techStack?.title ? "border-red-500" : ""
                      }
                    />
                    {errors.techStack?.title && (
                      <p className="text-sm text-red-500">
                        {errors.techStack.title.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="techStack.content"
                      className="text-sm font-medium"
                    >
                      Content
                    </Label>
                    <Textarea
                      id="techStack.content"
                      {...register("techStack.content")}
                      placeholder="Describe the technology stack used"
                      rows={3}
                      className={
                        errors.techStack?.content ? "border-red-500" : ""
                      }
                    />
                    {errors.techStack?.content && (
                      <p className="text-sm text-red-500">
                        {errors.techStack.content.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="techStack.image"
                      className="text-sm font-medium"
                    >
                      Image URL (Optional)
                    </Label>
                    <Input
                      id="techStack.image"
                      {...register("techStack.image")}
                      placeholder="Enter image URL for tech stack"
                      className={
                        errors.techStack?.image ? "border-red-500" : ""
                      }
                    />
                    {errors.techStack?.image && (
                      <p className="text-sm text-red-500">
                        {errors.techStack.image.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* How It Works */}
              <div className="space-y-4 p-4 border rounded-lg bg-[#FFFFFF]">
                <div className="space-y-2">
                  <Label
                    htmlFor="howItWorks.title"
                    className="text-sm font-medium"
                  >
                    Title
                  </Label>
                  <Input
                    id="howItWorks.title"
                    {...register("howItWorks.title")}
                    placeholder="e.g., How It Works"
                    className={errors.howItWorks?.title ? "border-red-500" : ""}
                  />
                  {errors.howItWorks?.title && (
                    <p className="text-sm text-red-500">
                      {errors.howItWorks.title.message}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">
                    How It Works Content
                  </h3>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() =>
                        appendHowItWorks({ type: "paragraph", content: "" })
                      }
                      size="sm"
                      variant="outline"
                    >
                      <Plus className="h-4 w-4" />
                      Add Paragraph
                    </Button>
                    <Button
                      type="button"
                      onClick={() =>
                        appendHowItWorks({ type: "image", content: "" })
                      }
                      size="sm"
                      variant="outline"
                    >
                      <Plus className="h-4 w-4" />
                      Add Image
                    </Button>
                  </div>
                </div>
                {howItWorksFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="space-y-4 p-4 border rounded bg-white"
                  >
                    <div className="space-y-2">
                      {watch(`howItWorks.content.${index}.type`) ===
                      "paragraph" ? (
                        <>
                          <div className="flex w-full justify-between items-center">
                            <Label className="text-sm font-medium">
                              Paragraph Content
                            </Label>
                            {howItWorksFields.length > 1 && (
                              <Button
                                type="button"
                                onClick={() => removeHowItWorks(index)}
                                size="sm"
                                variant="outline"
                                className="text-red-500"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <Controller
                            name={`howItWorks.content.${index}.content`}
                            control={control}
                            render={({ field }) => (
                              <TiptapEditor
                                placeholder="Enter paragraph..."
                                content={field.value || ""}
                                onChange={field.onChange}
                                className="w-full"
                              />
                            )}
                          />
                        </>
                      ) : (
                        <>
                          <div className="flex w-full justify-between items-center">
                            <Label className="text-sm font-medium">
                              Image URL
                            </Label>
                            {howItWorksFields.length > 1 && (
                              <Button
                                type="button"
                                onClick={() => removeHowItWorks(index)}
                                size="sm"
                                variant="outline"
                                className="text-red-500"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <Input
                            {...register(`howItWorks.content.${index}.content`)}
                            placeholder="Enter image URL"
                            className={
                              errors.howItWorks?.content?.[index]?.content
                                ? "border-red-500"
                                : ""
                            }
                          />
                        </>
                      )}
                      {errors.howItWorks?.content?.[index]?.content && (
                        <p className="text-sm text-red-500">
                          {errors.howItWorks.content[index]?.content?.message}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Time to Build */}
              <div className="space-y-4 p-4 border rounded-lg bg-[#FFFFFF]">
                <h3 className="font-semibold text-lg">Time to Build</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="timeToBuild.title"
                      className="text-sm font-medium"
                    >
                      Title
                    </Label>
                    <Input
                      id="timeToBuild.title"
                      {...register("timeToBuild.title")}
                      placeholder="e.g., Development Time"
                      className={
                        errors.timeToBuild?.title ? "border-red-500" : ""
                      }
                    />
                    {errors.timeToBuild?.title && (
                      <p className="text-sm text-red-500">
                        {errors.timeToBuild.title.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="timeToBuild.content"
                      className="text-sm font-medium"
                    >
                      Content
                    </Label>
                    <Input
                      id="timeToBuild.content"
                      {...register("timeToBuild.content")}
                      placeholder="e.g., 2 weeks, 1 month, 3 months"
                      className={
                        errors.timeToBuild?.content ? "border-red-500" : ""
                      }
                    />
                    {errors.timeToBuild?.content && (
                      <p className="text-sm text-red-500">
                        {errors.timeToBuild.content.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end pt-6 gap-5">
                <Button
                  onClick={handleCancelClick}
                  type="button"
                  variant={"outline"}
                  className="px-8 py-2"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-8 py-2"
                >
                  {isSubmitting
                    ? id
                      ? "Updating..."
                      : "Creating..."
                    : id
                    ? "Update Project"
                    : "Create Project"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
