"use client";

import React, { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useSlugAvailability } from "@/components/Pages/Common/Blogs/v2/useSlugAvailability";
import {
  createInterviewQuestion,
  checkSlugAvailability,
} from "@/services/interview-questions/interview-question-service";
import { ROLE_OPTIONS, TYPE_OPTIONS } from "./questionOptions";

// Tiptap needs the browser; load the shared blog-v2 editor client-side only.
const TiptapEditor = dynamic(
  () => import("@/components/TiptapEditor/TiptapEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    ),
  }
);

const slugify = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

export default function CreateInterviewQuestion() {
  const router = useRouter();
  const role = Cookies.get("currentRole") || "admin";

  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [roleOther, setRoleOther] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [typeOther, setTypeOther] = useState("");
  const [slug, setSlug] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [answerHtml, setAnswerHtml] = useState("");
  const [answerAuthor, setAnswerAuthor] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const checkSlug = useCallback((s: string) => checkSlugAvailability(s), []);
  const { slugAvailable, checkingSlug } = useSlugAvailability(slug, checkSlug);

  const toggleType = (type: string) =>
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );

  const resolvedRole = useMemo(
    () => (selectedRole === "Other" ? roleOther.trim() : selectedRole),
    [selectedRole, roleOther]
  );

  const resolvedTypes = useMemo(
    () =>
      selectedTypes
        .map((t) => (t === "Other" ? typeOther.trim() : t))
        .filter(Boolean),
    [selectedTypes, typeOther]
  );

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Question title is required.");
      return;
    }
    if (slug && slugAvailable === false) {
      toast.error("Please choose an available slug.");
      return;
    }

    setSubmitting(true);
    try {
      await createInterviewQuestion({
        title: title.trim(),
        company: company.trim(),
        phone: phone.trim(),
        role: resolvedRole ? [resolvedRole] : [],
        type: resolvedTypes,
        slug: slug ? slugify(slug) : undefined,
        isPublished,
        answerContent: answerHtml,
        userName: answerAuthor.trim() || undefined,
      });

      toast.success("Interview question created.");
      router.push(`/${role}/interview-questions`);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Failed to create question. Please try again.";
      toast.error(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Header */}
      <div className="px-5 h-16 flex justify-between items-center border-b border-gray-200">
        <div className="flex items-center gap-3">
          <ArrowLeft
            className="h-5 w-5 cursor-pointer"
            onClick={() => router.back()}
          />
          <p className="text-lg font-semibold text-gray-900">
            Add Interview Question
          </p>
        </div>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Saving…" : "Create Question"}
        </Button>
      </div>

      {/* Body */}
      <div className="p-6 overflow-y-auto bg-gray-50 h-[90vh]">
        <div className="space-y-6 w-full max-w-4xl mx-auto">
          {/* Question details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
                Question Details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-5">
              <div className="space-y-1.5">
                <Label htmlFor="title">
                  Question <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter the interview question"
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="e.g. Google"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="role">Role</Label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger id="role" className="w-full">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedRole === "Other" && (
                <div className="space-y-1.5">
                  <Label htmlFor="roleOther">Specify the role</Label>
                  <Input
                    id="roleOther"
                    value={roleOther}
                    onChange={(e) => setRoleOther(e.target.value)}
                    placeholder="Enter the role"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Type(s)</Label>
                <div className="flex flex-wrap gap-2">
                  {TYPE_OPTIONS.map((t) => {
                    const active = selectedTypes.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleType(t)}
                        className={cn(
                          "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                          active
                            ? "bg-blue-50 border-blue-400 text-blue-700"
                            : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"
                        )}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedTypes.includes("Other") && (
                <div className="space-y-1.5">
                  <Label htmlFor="typeOther">Specify the type</Label>
                  <Input
                    id="typeOther"
                    value={typeOther}
                    onChange={(e) => setTypeOther(e.target.value)}
                    placeholder="Enter the type"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone (optional)</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Contact number"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="slug">URL slug (optional)</Label>
                  <div className="relative">
                    <Input
                      id="slug"
                      value={slug}
                      onChange={(e) => setSlug(slugify(e.target.value))}
                      placeholder="how-to-crack-pm-interviews"
                      className={cn(
                        "pr-10",
                        slug && slugAvailable === false
                          ? "border-red-500 focus-visible:ring-red-500"
                          : slug && slugAvailable === true
                            ? "border-green-500 focus-visible:ring-green-500"
                            : ""
                      )}
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      {checkingSlug ? (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      ) : slug && slugAvailable === true ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : slug && slugAvailable === false ? (
                        <X className="w-4 h-4 text-red-500" />
                      ) : null}
                    </div>
                  </div>
                  {slug && slugAvailable === false && (
                    <p className="text-xs text-red-500">
                      This slug is already taken.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between border rounded-md p-3">
                <div>
                  <Label className="text-sm font-medium">Publish now</Label>
                  <p className="text-xs text-muted-foreground">
                    Make this question visible on the public site immediately.
                  </p>
                </div>
                <Switch checked={isPublished} onCheckedChange={setIsPublished} />
              </div>
            </CardContent>
          </Card>

          {/* Answer */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
                Answer (optional)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5 max-w-sm">
                <Label htmlFor="answerAuthor">Answer author name</Label>
                <Input
                  id="answerAuthor"
                  value={answerAuthor}
                  onChange={(e) => setAnswerAuthor(e.target.value)}
                  placeholder="Product Space"
                />
                <p className="text-xs text-muted-foreground">
                  Shown as the answer author on the public site. Leave blank to
                  use &ldquo;Product Space&rdquo;.
                </p>
              </div>
              <TiptapEditor
                variant="answer"
                initialHtml=""
                onChangeHtml={setAnswerHtml}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
