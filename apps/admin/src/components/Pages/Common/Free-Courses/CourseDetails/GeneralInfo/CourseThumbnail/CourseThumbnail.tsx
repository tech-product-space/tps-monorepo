"use client";

import React, { useState } from "react";
import { Course } from "@/types/course";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Trash2, ImageIcon, Film } from "lucide-react";
import {
    uploadWrittenCourseFile,
    deleteWrittenCourseFile,
    uploadWrittenCourseVideo,
} from "@/services/written-course/wrttenCourseService";
import { resolveStorageUrl } from "@/lib/stoage";
import { toast } from "sonner";

interface CourseThumbnailProps {
    form: Partial<Course>;
    setForm: React.Dispatch<React.SetStateAction<Partial<Course>>>;
}

export const CourseThumbnail: React.FC<CourseThumbnailProps> = ({
    form,
    setForm,
}) => {
    const [uploading, setUploading] = useState(false);
    const [videoUploading, setVideoUploading] = useState(false);
    const [videoProgress, setVideoProgress] = useState(0);

    const courseId = (form as any)?.id;
    const thumbnailKey = (form.thumbnail) || "";
    const thumbnailUrl = thumbnailKey ? resolveStorageUrl(thumbnailKey) : null;

    const videoKey = form.thumbnail_video || "";
    const videoUrl = videoKey ? resolveStorageUrl(videoKey) : null;
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ""; // reset so same file can be re-selected
        if (!file) return;

        if (!courseId) {
            toast.error("Save the course first, then upload a thumbnail.");
            return;
        }

        try {
            setUploading(true);
            const response = await uploadWrittenCourseFile(file, courseId);
            const fileName = response.fileUrl.split("/").pop();
            const fullKey = `written-course/${courseId}/${fileName}`;

            setForm((prev) => ({
                ...prev,
                thumbnail: fullKey,
            }));
            toast.success("Thumbnail uploaded");
        } catch (err: any) {
            console.error("Thumbnail upload failed:", err);
            toast.error(
                err?.message ||
                err?.response?.data?.message ||
                "Thumbnail upload failed",
            );
        } finally {
            setUploading(false);
        }
    };

    const handleRemove = async () => {
        if (courseId && thumbnailKey) {
            try {
                await deleteWrittenCourseFile(thumbnailKey);
            } catch (err) {
                console.error("Failed to delete thumbnail from server:", err);
            }
        }

        setForm((prev) => ({
            ...prev,
            thumbnail: "",
        }));
    };

    const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ""; // reset so same file can be re-selected
        if (!file) return;

        if (!courseId) {
            toast.error("Save the course first, then upload a video.");
            return;
        }

        try {
            setVideoUploading(true);
            setVideoProgress(0);
            const { key } = await uploadWrittenCourseVideo(
                file,
                courseId,
                (pct) => setVideoProgress(pct),
            );

            setForm((prev) => ({
                ...prev,
                thumbnail_video: key,
            }));
            toast.success("Thumbnail video uploaded");
        } catch (err: any) {
            console.error("Thumbnail video upload failed:", err);
            toast.error(
                err?.message ||
                err?.response?.data?.message ||
                "Video upload failed",
            );
        } finally {
            setVideoUploading(false);
            setVideoProgress(0);
        }
    };

    const handleVideoRemove = async () => {
        if (videoKey) {
            try {
                await deleteWrittenCourseFile(videoKey);
            } catch (err) {
                console.error("Failed to delete video from server:", err);
            }
        }

        setForm((prev) => ({
            ...prev,
            thumbnail_video: "",
        }));
    };

    return (
        <Card className="border-gray-200">
            <CardHeader className="border-b border-gray-100 pb-2!">
                <CardTitle className="text-lg font-semibold">
                    Course Thumbnail
                </CardTitle>
            </CardHeader>

            <CardContent>
                <Label className="text-[13px] font-semibold tracking-wider">
                    Thumbnail
                </Label>
                <p className="text-xs text-muted-foreground mb-4 mt-0.5">
                    Recommended size 1080×565 (≈19:10) — PNG, JPG, AVIF, or WEBP, max 2 MB
                </p>

                <div className="w-2/3">
                    {thumbnailUrl ? (
                        /* ── Preview ── */
                        <div className="relative group rounded-lg overflow-hidden border bg-muted/30">
                            <img
                                src={thumbnailUrl}
                                alt="Course thumbnail"
                                className="w-full aspect-[1080/565] object-cover"
                            />

                            {/* Hover overlay */}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                {/* Replace */}
                                <label className="cursor-pointer">
                                    <Button
                                        asChild
                                        size="sm"
                                        variant="secondary"
                                        className="pointer-events-none gap-1.5"
                                        disabled={uploading}
                                    >
                                        <span>
                                            {uploading ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Upload className="h-3.5 w-3.5" />
                                            )}
                                            {uploading ? "Uploading…" : "Replace"}
                                        </span>
                                    </Button>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        disabled={uploading}
                                        onChange={handleUpload}
                                    />
                                </label>

                                {/* Remove */}
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    className="gap-1.5"
                                    onClick={handleRemove}
                                    disabled={uploading}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Remove
                                </Button>
                            </div>
                        </div>
                    ) : (
                        /* ── Upload dropzone ── */
                        <label
                            className={`flex flex-col items-center justify-center w-full rounded-lg border-2 border-dashed transition-colors cursor-pointer
                ${uploading
                                    ? "border-blue-300 bg-blue-50/40 cursor-default"
                                    : "border-gray-300 bg-muted/20 hover:border-blue-400 hover:bg-blue-50/30"
                                }`}
                            style={{ aspectRatio: "1080 / 565" }}
                        >
                            {uploading ? (
                                <div className="flex flex-col items-center gap-2 text-blue-600">
                                    <Loader2 className="h-7 w-7 animate-spin" />
                                    <span className="text-sm font-medium">Uploading…</span>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-2 text-gray-400">
                                    <div className="p-3 rounded-full bg-gray-100">
                                        <ImageIcon className="h-6 w-6" />
                                    </div>
                                    <p className="text-sm font-medium text-gray-600">
                                        Click to upload thumbnail
                                    </p>
                                    <p className="text-xs">PNG, JPG, WEBP — max 2 MB</p>
                                </div>
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={uploading}
                                onChange={handleUpload}
                            />
                        </label>
                    )}
                </div>

                {/* ── Thumbnail Video (optional) ── */}
                <div className="mt-8 border-t border-gray-100 pt-6">
                    <Label className="text-[13px] font-semibold tracking-wider">
                        Thumbnail Video (optional)
                    </Label>
                    <p className="text-xs text-muted-foreground mb-4 mt-0.5">
                        MP4 or WEBM, max 2 MB. Plays muted &amp; looping on the
                        course listing; the image above is shown as a poster while it
                        loads and as a fallback.
                    </p>

                    <div className="w-2/3">
                        {videoUrl ? (
                            /* ── Preview ── */
                            <div className="relative group rounded-lg overflow-hidden border bg-muted/30">
                                <video
                                    src={videoUrl}
                                    poster={thumbnailUrl || undefined}
                                    muted
                                    loop
                                    playsInline
                                    controls
                                    className="w-full aspect-[1080/565] object-cover bg-black"
                                />

                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 pointer-events-none">
                                    <label className="cursor-pointer pointer-events-auto">
                                        <Button
                                            asChild
                                            size="sm"
                                            variant="secondary"
                                            className="pointer-events-none gap-1.5"
                                            disabled={videoUploading}
                                        >
                                            <span>
                                                {videoUploading ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Upload className="h-3.5 w-3.5" />
                                                )}
                                                {videoUploading
                                                    ? `Uploading… ${videoProgress}%`
                                                    : "Replace"}
                                            </span>
                                        </Button>
                                        <input
                                            type="file"
                                            accept="video/mp4,video/webm"
                                            className="hidden"
                                            disabled={videoUploading}
                                            onChange={handleVideoUpload}
                                        />
                                    </label>

                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        className="gap-1.5 pointer-events-auto"
                                        onClick={handleVideoRemove}
                                        disabled={videoUploading}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        Remove
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            /* ── Upload dropzone ── */
                            <label
                                className={`flex flex-col items-center justify-center w-full rounded-lg border-2 border-dashed transition-colors cursor-pointer
                ${videoUploading
                                        ? "border-blue-300 bg-blue-50/40 cursor-default"
                                        : "border-gray-300 bg-muted/20 hover:border-blue-400 hover:bg-blue-50/30"
                                    }`}
                                style={{ aspectRatio: "1080 / 565" }}
                            >
                                {videoUploading ? (
                                    <div className="flex flex-col items-center gap-2 text-blue-600">
                                        <Loader2 className="h-7 w-7 animate-spin" />
                                        <span className="text-sm font-medium">
                                            Uploading… {videoProgress}%
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-gray-400">
                                        <div className="p-3 rounded-full bg-gray-100">
                                            <Film className="h-6 w-6" />
                                        </div>
                                        <p className="text-sm font-medium text-gray-600">
                                            Click to upload video
                                        </p>
                                        <p className="text-xs">MP4 or WEBM — recommended 19:10</p>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="video/mp4,video/webm"
                                    className="hidden"
                                    disabled={videoUploading}
                                    onChange={handleVideoUpload}
                                />
                            </label>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};