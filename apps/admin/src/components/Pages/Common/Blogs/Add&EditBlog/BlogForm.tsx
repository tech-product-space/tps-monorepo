"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { format } from "date-fns";
import { ArrowLeft, CalendarIcon, Plus, Trash2 } from "lucide-react";
import Cookies from "js-cookie";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  addBlog,
  deleteBlogFile,
  updateBlog,
  uploadBlogFile,
} from "@/services/blog/blogService";
import { useNotification } from "@/helpers/NotificationContext";
import { useRouter } from "next/navigation";
import BlogEditor from "../BlogEditor/BlogEditor";
import { useRef, useState } from "react";

interface BlogContentBase {
  type: string;
}

export interface ParagraphContent extends BlogContentBase {
  type: "paragraph";
  content: string;
}

export interface ImageContent extends BlogContentBase {
  type: "image";
  src: string;
  alt: string;
  credit?: string;
}

export interface VideoContent extends BlogContentBase {
  type: "video";
  src: string;
  alt: string;
  credit?: string;
  thumbnail?: string;
  loop?: boolean;
  autoplay?: boolean;
}

export interface YoutubeContent extends BlogContentBase {
  type: "youtube";
  src: string;
  alt: string;
  credit?: string;
  loop?: boolean;
  autoplay?: boolean;
}

export type BlogContent =
  | ParagraphContent
  | ImageContent
  | VideoContent
  | YoutubeContent;

export interface BlogData {
  type?: any;
  title: string;
  author: string;
  publishedDate: Date;
  category: string;
  metaTitle: string;
  metaDesc: string;
  readTime: number;
  thumbnailSrc: string;
  thumbnailAlt: string;
  url: string;
  content: BlogContent[];
}

const contentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("paragraph"),
    content: z.string().min(1, "Paragraph content is required"),
  }),
  z.object({
    type: z.literal("image"),
    src: z.string().min(1, "Image source is required"),
    alt: z.string().min(1, "Alt text is required"),
    credit: z.string().optional(),
  }),
  z.object({
    type: z.literal("video"),
    src: z.string().min(1, "Video source is required"),
    thumbnail: z.string().optional(),
    alt: z.string().min(1, "Alt text is required"),
    credit: z.string().optional(),
    loop: z.boolean().optional(),
    autoplay: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("youtube"),
    src: z.string().min(1, "YouTube URL is required"),
    alt: z.string().min(1, "Alt text is required"),
    credit: z.string().optional(),
    loop: z.boolean().optional(),
    autoplay: z.boolean().optional(),
  }),
]);

const formSchema = z.object({
  title: z
    .string()
    .min(2, "Title must be at least 2 characters")
    .max(200, "Title must be less than 100 characters"),
  author: z.string().min(2, "Author name is required"),
  publishedDate: z.date({
    required_error: "Published date is required",
  }),
  category: z.string({
    required_error: "Please select a category",
  }),
  url: z
    .string()
    .min(2, "Url must be at least 2 characters")
    .max(200, "Url must be less than 100 characters"),
  metaTitle: z
    .string()
    .min(2, "Title must be at least 2 characters")
    .max(200, "Title must be less than 100 characters"),
  metaDesc: z
    .string()
    .min(2, "Description must be at least 2 characters")
    .max(200, "Description must be less than 100 characters"),
  readTime: z.coerce
    .number({
      invalid_type_error: "Read time must be a number",
    })
    .int("Read time must be a whole number")
    .min(1, "Read time must be at least 1 minute"),
  thumbnailSrc: z.string().min(1, "Thumbnail source is required"),
  thumbnailAlt: z.string().min(1, "Thumbnail Alt text is required"),
  content: z
    .array(contentSchema)
    .min(1, "At least one content item is required"),
  faqs: z
    .array(
      z.object({
        question: z.string().min(1, "Question is required"),
        answer: z.string().min(1, "Answer is required"),
      }),
    )
    .optional(),
});

export type FormValues = z.infer<typeof formSchema>;

interface BlogFormProps {
  initialData?: FormValues & { id?: string };
  id?: string;
  placement?: string;
  routeSegment?: string;
}

/* -------------------- Helpers -------------------- */

/** map a form content item to plain JS content (ensures defaults) */
function mapContentItem(item: any) {
  if (item.type === "paragraph") {
    return { type: "paragraph", content: item.content };
  }
  if (item.type === "image") {
    return {
      type: "image",
      src: item.src,
      alt: item.alt,
      credit: item.credit ?? "",
    };
  }
  if (item.type === "video") {
    return {
      type: "video",
      src: item.src,
      thumbnail: item.thumbnail ?? undefined,
      alt: item.alt,
      credit: item.credit ?? "",
      loop: item.loop ?? false,
      autoplay: item.autoplay ?? false,
    };
  }
  if (item.type === "youtube") {
    return {
      type: "youtube",
      src: item.src,
      alt: item.alt,
      credit: item.credit ?? "",
      loop: item.loop ?? false,
      autoplay: item.autoplay ?? false,
    };
  }
  return item;
}

/* -------------------- Component -------------------- */

export default function BlogForm({
  initialData,
  id,
  placement = "blog",
  routeSegment = "blogs",
}: BlogFormProps) {
  const { showNotification } = useNotification();
  const router = useRouter();
  const isEditing = !!initialData;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      title: "",
      author: "",
      category: "",
      url: "",
      metaTitle: "",
      metaDesc: "",
      readTime: 1,
      thumbnailSrc: "",
      thumbnailAlt: "",
      publishedDate: undefined,
      content: [],
      faqs: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "content",
  });

  const {
    fields: faqFields,
    append: appendFaq,
    remove: removeFaq,
  } = useFieldArray({
    control: form.control,
    name: "faqs",
  });

  /* add helpers */
  const addParagraph = () => append({ type: "paragraph", content: "" });
  const addImage = () =>
    append({ type: "image", src: "", alt: "", credit: "" });
  const addVideo = () =>
    append({
      type: "video",
      src: "",
      thumbnail: "",
      alt: "",
      credit: "",
      loop: false,
      autoplay: false,
    });
  const addYouTube = () =>
    append({
      type: "youtube",
      src: "",
      alt: "",
      credit: "",
      loop: false,
      autoplay: false,
    });

  /* consolidated request body builder */
  const prepareRequestBody = (
    values: FormValues,
    publishType: "publish" | "draft",
  ) => {
    return {
      url: values.url.trim(),
      title: values.title,
      author: values.author,
      // if publishedDate is a Date object -> normalize to yyyy-MM-dd (server expects date string)
      publishedDate: values.publishedDate
        ? new Date(format(values.publishedDate, "yyyy-MM-dd"))
        : undefined,
      category: values.category,
      metaTitle: values.metaTitle,
      metaDesc: values.metaDesc,
      readTime: values.readTime,
      thumbnailSrc: values.thumbnailSrc,
      thumbnailAlt: values.thumbnailAlt,
      type: publishType,
      placement,
      faqs: (values.faqs ?? []).filter(
        (f) => f.question?.trim() && f.answer?.trim(),
      ),
      content: values.content.map(mapContentItem),
    };
  };

  const role = Cookies.get("currentRole");

  const updateBlogDataFn = async (requestbody: any) => {
    if (!id) return;
    try {
      const response = await updateBlog(requestbody, id);
      showNotification("success", "Action Successful", response.message, {
        label: "Close",
        onClick: () => console.log("Close clicked"),
      });
      router.push(`/${role}/${routeSegment}`);
    } catch (err: any) {
      showNotification(
        "error",
        "Action Failed",
        err?.message || "Failed to update blog",
      );
    }
  };

  const addBlogDataFn = async (requestbody: any) => {
    try {
      const response = await addBlog(requestbody);
      showNotification("success", "Action Successful", response.message, {
        label: "Close",
        onClick: () => console.log("Close clicked"),
      });
      router.push(`/${role}/${routeSegment}`);
    } catch (err: any) {
      console.log("Some Error Occured");
    }
  };

  const onSubmit = (values: FormValues) => {
    const requestbody = prepareRequestBody(values, "publish");
    if (isEditing) {
      updateBlogDataFn(requestbody);
    } else {
      addBlogDataFn(requestbody);
    }
  };

  const onDraft = () => {
    const values = form.getValues();
    const requestbody = prepareRequestBody(values, "draft");
    if (isEditing) {
      updateBlogDataFn(requestbody);
    } else {
      addBlogDataFn(requestbody);
    }
  };

  const [isPreview, setIsPreview] = useState(false);

  function onPreview() {
    setIsPreview(true);
    console.log(form.getValues());
  }

  if (isPreview) {
    return (
      <div className="container mx-auto p-5">
        <Button
          type="button"
          variant={"ghost"}
          onClick={() => setIsPreview(false)}
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
        </Button>
        <BlogPost blog={form.getValues()} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="container mx-auto pb-10 px-10 py-5">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter blog title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Blog URL (lowercase letters with spaces only — no special
                    characters like & / ? #)
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Enter blog url" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="author"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Author</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter author name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="publishedDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Published Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={`w-full justify-start text-left font-normal ${!field.value ? "text-muted-foreground" : ""
                            }`}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center justify-between gap-4 w-full">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Category</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Artificial Intelligence">
                          Artificial Intelligence
                        </SelectItem>
                        <SelectItem value="Industry & Career Insights">
                          Industry & Career Insights
                        </SelectItem>
                        <SelectItem value="Interview Preparation">
                          Interview Preparation
                        </SelectItem>
                        <SelectItem value="Product Fundamentals">
                          Product Fundamentals
                        </SelectItem>
                        <SelectItem value="Product Growth & Analytics">
                          Product Growth & Analytics
                        </SelectItem>
                        <SelectItem value="Leadership & Strategy">
                          Leadership & Strategy
                        </SelectItem>
                        <SelectItem value="Frameworks and Templates">
                          Frameworks and Templates
                        </SelectItem>
                        <SelectItem value="Tools and Workflows">
                          Tools and Workflows
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="readTime"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Read Time</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter read time (in minutes)"
                        {...field}
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="metaTitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Meta Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter blog meta title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="metaDesc"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Meta Description</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter blog description title"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="thumbnailSrc"
              render={({ field }) => {
                const fileInputRef = useRef<HTMLInputElement>(null);

                return (
                  <FormItem>
                    <FormLabel>Thumbnail Image</FormLabel>

                    <FormControl>
                      <>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;

                            try {
                              // Delete previous image if exists
                              if (field.value) {
                                const key = field.value.split("/").pop();
                                if (key) {
                                  await deleteBlogFile({ key });
                                }
                              }

                              // Upload image
                              const res = await uploadBlogFile(file);

                              // ✅ CORRECT FIELD
                              field.onChange(res.fileUrl);
                            } catch (error) {
                              console.error("Image upload failed", error);
                            } finally {
                              if (fileInputRef.current) {
                                fileInputRef.current.value = "";
                              }
                            }
                          }}
                        />

                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-fit"
                        >
                          {field.value
                            ? "Change Thumbnail"
                            : "Upload Thumbnail"}
                        </Button>
                      </>
                    </FormControl>

                    {/* Preview */}
                    {field.value && (
                      <div className="mt-4">
                        <img
                          src={field.value}
                          alt="Thumbnail preview"
                          className="h-40 w-fit rounded-md object-cover border"
                        />
                      </div>
                    )}

                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="thumbnailAlt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Thumbnail Alt Text</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter thumbnail image alt text"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <FormLabel className="text-base">Content</FormLabel>
              </div>

              {fields.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No content added yet. Click "Add Content" to start building
                  your blog post.
                </p>
              )}

              {fields.map((field, index) => {
                const contentItem = form.watch(`content.${index}`);
                const contentType = contentItem?.type;

                return (
                  <Card key={field.id} className="relative">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove</span>
                    </Button>

                    <CardHeader>
                      <CardTitle className="text-sm font-medium">
                        {contentType === "paragraph"
                          ? "Paragraph"
                          : contentType === "image"
                            ? "Image"
                            : contentType === "video"
                              ? "Video"
                              : contentType === "youtube"
                                ? "YouTube Video"
                                : null}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {contentType === "paragraph" ? (
                        <FormField
                          control={form.control}
                          name={`content.${index}.content`}
                          render={({ field }) => (
                            <BlogEditor
                              content={field.value}
                              onChange={field.onChange}
                              id={index}
                            />
                          )}
                        />
                      ) : contentType === "image" ? (
                        <div className="space-y-4">
                          <FormField
                            control={form.control}
                            name={`content.${index}.src`}
                            render={({ field }) => {
                              const fileInputRef =
                                useRef<HTMLInputElement>(null);

                              return (
                                <FormItem>
                                  <FormLabel>Image</FormLabel>

                                  <FormControl>
                                    <>
                                      {/* Hidden file input */}
                                      <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          if (!file) return;

                                          try {
                                            // Delete previous image if exists
                                            if (field.value) {
                                              const key = field.value
                                                .split("/")
                                                .pop();
                                              if (key) {
                                                await deleteBlogFile({ key });
                                              }
                                            }

                                            // Upload new image
                                            const res =
                                              await uploadBlogFile(file);

                                            // Save URL in form state
                                            field.onChange(res.fileUrl);
                                          } catch (error) {
                                            console.error(
                                              "Content image upload failed",
                                              error,
                                            );
                                          } finally {
                                            if (fileInputRef.current) {
                                              fileInputRef.current.value = "";
                                            }
                                          }
                                        }}
                                      />

                                      {/* Upload button */}
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          fileInputRef.current?.click()
                                        }
                                        className="w-fit"
                                      >
                                        {field.value
                                          ? "Change Image"
                                          : "Upload Image"}
                                      </Button>
                                    </>
                                  </FormControl>

                                  {/* Preview */}
                                  {field.value && (
                                    <div className="mt-3">
                                      <img
                                        src={field.value}
                                        alt="Content image preview"
                                        className="max-h-60 w-fit rounded-md border object-cover"
                                      />
                                    </div>
                                  )}

                                  <FormMessage />
                                </FormItem>
                              );
                            }}
                          />
                          <FormField
                            control={form.control}
                            name={`content.${index}.alt`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Alt Text</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Enter image alt text"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`content.${index}.credit`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Credit (Optional)</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Enter image credit"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      ) : contentType === "video" ? (
                        <div className="space-y-4">
                          <FormField
                            control={form.control}
                            name={`content.${index}.src`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Video URL (mp4 only)</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Enter video URL (mp4 or S3/Cloud URL)"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`content.${index}.thumbnail`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Thumbnail URL (optional)</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Enter video thumbnail/poster URL (optional)"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`content.${index}.alt`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Alt Text</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Enter video alt text"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`content.${index}.credit`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Credit (Optional)</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Enter video credit"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`content.${index}.loop`}
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>Loop Video</FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`content.${index}.autoplay`}
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>Autoplay Video</FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                        </div>
                      ) : contentType === "youtube" ? (
                        <div className="space-y-4">
                          <FormField
                            control={form.control}
                            name={`content.${index}.src`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>YouTube URL</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Enter YouTube URL (e.g., https://youtu.be/VIDEO_ID)"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`content.${index}.alt`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Alt Text</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Enter video alt text"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`content.${index}.credit`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Credit (Optional)</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Enter video credit"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`content.${index}.loop`}
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>Loop Video</FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`content.${index}.autoplay`}
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>Autoplay Video</FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
              {fields.length > 0 && (
                <FormMessage>
                  {form.formState.errors.content?.message}
                </FormMessage>
              )}

              <div className="flex items-center justify-end gap-5">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onDraft()}
                >
                  Save as Draft
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Content
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={addParagraph}>
                      Add Paragraph
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={addImage}>
                      Add Image
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={addVideo}>
                      Add Video
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={addYouTube}>
                      Add YouTube Video
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <FormLabel className="text-base">
                  FAQs (optional)
                </FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => appendFaq({ question: "", answer: "" })}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add FAQ
                </Button>
              </div>

              {faqFields.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No FAQs added. These render as an accordion on the blog page.
                </p>
              )}

              {faqFields.map((field, index) => (
                <Card key={field.id} className="relative">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={() => removeFaq(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Remove FAQ</span>
                  </Button>

                  <CardHeader>
                    <CardTitle className="text-sm font-medium">
                      FAQ {index + 1}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name={`faqs.${index}.question`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Question</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter the question"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`faqs.${index}.answer`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Answer</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Enter the answer"
                              rows={4}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex justify-between gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/${role}/${routeSegment}`)}
              >
                Cancel
              </Button>
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onPreview()}
                >
                  Preview
                </Button>
                <Button type="submit">{isEditing ? "Update" : "Submit"}</Button>
              </div>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}

function removeEmptyParagraphs(html: any) {
  return html.replace(/<p>(\s|<br>|<br\/>)*<\/p>/g, "");
}

export function BlogPost({ blog }: { blog: BlogData }) {
  const sanitizeQuillHTML = (html: string) => {
    if (!html) return "";
    const div = document.createElement("div");
    div.innerHTML = html;

    div.querySelectorAll(".ql-ui").forEach((el) => el.remove());

    return div.innerHTML;
  };

  return (
    <Card className="max-w-4xl mx-auto mt-2 mb-10 space-y-6">
      <CardContent>
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
          {blog.category}
        </div>
        <h1 className="text-3xl font-bold mb-1">{blog.title}</h1>
        <div className="text-sm text-gray-600 mb-6">
          By {blog.author} • {new Date(blog.publishedDate).toLocaleDateString()}
        </div>

        {blog.content.map((block, index) => {
          if (block.type === "paragraph" && block.content) {
            return (
              <div
                key={index}
                className="ql-editor1 text-black prose max-w-full overflow-x-auto text-base "
                dangerouslySetInnerHTML={{
                  __html: removeEmptyParagraphs(
                    sanitizeQuillHTML(block.content),
                  ),
                }}
              />
            );
          }

          if (block.type === "image" && block.src) {
            return (
              <div key={index} className="my-6 text-center">
                <img
                  src={block.src}
                  alt={block.alt || "Blog image"}
                  className="mx-auto rounded-lg shadow-sm"
                />
                {block.credit && (
                  <p className="text-xs text-gray-400 mt-1">{block.credit}</p>
                )}
              </div>
            );
          }

          if (block.type === "video" && block.src) {
            return (
              <div key={index} className="my-6 text-center">
                <video
                  controls
                  preload="none"
                  className="mx-auto rounded-lg shadow-sm"
                >
                  <source src={block.src} type="video/mp4" />
                </video>
                {block.credit && (
                  <p className="text-xs text-gray-400 mt-1">{block.credit}</p>
                )}
              </div>
            );
          }

          return null;
        })}
      </CardContent>
    </Card>
  );
}
