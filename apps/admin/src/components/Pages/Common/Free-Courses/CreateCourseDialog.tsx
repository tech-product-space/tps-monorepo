"use client";

import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  createCourse,
  checkCourseSlugAvailability,
} from "@/services/courses/courses";
import { toast } from "sonner";
import {
  Plus,
  Layout,
  Search,
  Settings2,
  Info,
  Loader2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

/* ---------------- Schema ---------------- */

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required"),
  subtitle: z.string().min(1, "Subtitle is required"),
  description: z.string().min(1, "Description is required"),
  is_video_course: z.boolean(),
  status: z.enum(["draft", "published"]),
});

type FormValues = z.infer<typeof formSchema>;

/* ---------------- Component ---------------- */

export default function CreateCourseDialog({ onSync }: { onSync: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("general");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      slug: "",
      subtitle: "",
      description: "",
      is_video_course: false,
      status: "draft",
    },
  });

  const [slugAvailable, setSlugAvailable] = useState<null | boolean>(null);
  const [slugMessage, setSlugMessage] = useState("");
  const [slugLoading, setSlugLoading] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");

  const watchSlug = form.watch("slug");

  /* -------- Slug Availability Check -------- */

  useEffect(() => {
    if (!watchSlug || watchSlug.trim() === "") {
      setSlugAvailable(null);
      setSlugMessage("");
      return;
    }

    const timer = setTimeout(async () => {
      setSlugLoading(true);
      try {
        const res = await checkCourseSlugAvailability(watchSlug);
        setSlugAvailable(res.available);
        setSlugMessage(
          res.available ? "Slug is available" : "Slug is already taken",
        );
      } catch (error) {
        setSlugAvailable(null);
        setSlugMessage("Error checking slug availability");
      } finally {
        setSlugLoading(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [watchSlug]);

  /* ---------------- Submit ---------------- */

  const onSubmit = async (values: FormValues) => {
    try {
      setLoading(true);
      await createCourse({
        ...values,
        thumbnail: "",
        content: {},
      });
      toast.success("Course created successfully");
      setOpen(false);
      form.reset();
      onSync();
    } catch {
      toast.error("Failed to create course");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- UI ---------------- */

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Create Course
        </Button>
      </DialogTrigger>

      <DialogContent className="w-full max-w-[800px] p-0 flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Layout className="h-5 w-5 text-primary" />
            Create New Course
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col flex-1"
          >
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex flex-col flex-1"
            >
              {/* Tab Content */}
              <div className="flex-1 px-6 py-6 overflow-y-auto">
                {/* General Tab */}
                <TabsContent value="general" className="mt-0 space-y-6">
                  <div className="p-6 border rounded-lg bg-background">
                    <div className="grid grid-cols-2 gap-5">
                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem className="col-span-2">
                            <FormLabel>Course Title *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter course title"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="slug"
                        render={({ field }) => (
                          <FormItem className="col-span-2">
                            <FormLabel>Slug *</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input placeholder="course-slug" {...field} />
                                {slugLoading && (
                                  <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-gray-400" />
                                )}
                              </div>
                            </FormControl>
                            {slugAvailable !== null && (
                              <p
                                className={`text-sm mt-1 ${slugAvailable ? "text-green-600" : "text-red-600"}`}
                              >
                                {slugMessage}
                              </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="subtitle"
                        render={({ field }) => (
                          <FormItem className="col-span-2">
                            <FormLabel>Subtitle *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Brief course subtitle"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem className="col-span-2">
                            <FormLabel>
                              Description * (Keep is Short under 200 Aplhabets)
                            </FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Detailed course description"
                                className="min-h-[120px]"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Status *</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl className="w-full">
                                <SelectTrigger>
                                  <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="draft">Draft</SelectItem>
                                <SelectItem value="published">
                                  Published
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="is_video_course"
                        render={({ field }) => (
                          <FormItem className="col-span-2 p-4 border rounded-lg flex items-center justify-between">
                            <div>
                              <FormLabel className="text-base">
                                Video Course
                              </FormLabel>
                              <FormDescription>
                                Mark this course as a video course (shown as a
                                badge on the listing)
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t ">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Course"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
