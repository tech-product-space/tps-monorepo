"use client";

import React, { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Eye, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  AiProduct,
  AiProductContent,
  normalizeContent,
} from "@/types/aiProduct";
import {
  getAiProductById,
  getApiErrorMessage,
  openAiProductPreview,
  sanitizeSlugInput,
  slugifyClient,
  updateAiProduct,
} from "@/services/ai-products/aiProductService";
import ImageUploadField from "./ImageUploadField";
import SectionBuilder from "./SectionBuilder";
import HeroMediaBuilder from "./HeroMediaBuilder";

export default function AiProductEditor() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  // Works under any role tree (/admin/ai-products, /superadmin/ai-products, …)
  const pathname = usePathname();
  const basePath = `/${pathname?.split("/")[1] || "admin"}/ai-products`;

  const [product, setProduct] = useState<AiProduct | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState<AiProductContent | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await getAiProductById(id);
        setProduct(data);
        setName(data.name);
        setSlug(data.slug);
        setContent(normalizeContent(data.content));
      } catch {
        toast.error("Failed to load product");
        router.push(basePath);
      }
    })();
  }, [id, router, basePath]);

  if (!product || !content) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="animate-spin text-gray-400" />
      </div>
    );
  }

  const patch = (p: Partial<AiProductContent>) =>
    setContent((prev) => (prev ? { ...prev, ...p } : prev));

  const handleSave = async (statusOverride?: "draft" | "published"): Promise<boolean> => {
    if (!name.trim()) {
      toast.error("Name is required");
      return false;
    }
    if (!slug.trim()) {
      toast.error("Slug is required");
      return false;
    }
    const isPublishAction = statusOverride !== undefined;
    try {
      isPublishAction ? setPublishing(true) : setSaving(true);
      const updated = await updateAiProduct(product.id, {
        name: name.trim(),
        slug: slug.trim(),
        content,
        ...(statusOverride ? { status: statusOverride } : {}),
      });
      setProduct(updated);
      setSlug(updated.slug);
      toast.success(
        statusOverride === "published"
          ? "Saved & published"
          : statusOverride === "draft"
          ? "Unpublished"
          : "Saved"
      );
      return true;
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to save"));
      return false;
    } finally {
      isPublishAction ? setPublishing(false) : setSaving(false);
    }
  };

  // Saves first so the preview always shows the latest edits, then opens
  // the public site's token-protected preview page in a new tab.
  const handlePreview = async () => {
    const saved = await handleSave();
    if (!saved) return;
    try {
      setPreviewing(true);
      await openAiProductPreview(product.id);
    } catch {
      toast.error("Failed to open preview");
    } finally {
      setPreviewing(false);
    }
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag) return;
    if (!content.tags.includes(tag)) {
      patch({ tags: [...content.tags, tag] });
    }
    setTagInput("");
  };

  const updateMember = (index: number, p: Partial<AiProductContent["team"]["members"][number]>) => {
    const members = content.team.members.map((m, i) => (i === index ? { ...m, ...p } : m));
    patch({ team: { ...content.team, members } });
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="px-5 h-16 flex items-center justify-between gap-3 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => router.push(basePath)}>
            <ArrowLeft size={18} />
          </Button>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-gray-900 truncate leading-tight">
              {product.name}
            </p>
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              /ai-products/{product.slug}
              <Badge
                variant={product.status === "published" ? "default" : "secondary"}
                className="text-[10px] uppercase"
              >
                {product.status}
              </Badge>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={handlePreview}
            disabled={previewing || saving}
          >
            {previewing ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
            Preview
          </Button>
          {product.status === "published" && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                window.open(
                  `${process.env.NEXT_PUBLIC_WEBSITE_URL || "https://theproductspace.in"}/ai-products/${product.slug}`,
                  "_blank"
                )
              }
            >
              <ExternalLink size={14} />
              View
            </Button>
          )}
          <Button variant="outline" onClick={() => handleSave()} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save
          </Button>
          {product.status === "published" ? (
            <Button
              variant="secondary"
              onClick={() => handleSave("draft")}
              disabled={publishing}
            >
              {publishing ? <Loader2 size={14} className="animate-spin" /> : "Unpublish"}
            </Button>
          ) : (
            <Button onClick={() => handleSave("published")} disabled={publishing}>
              {publishing ? <Loader2 size={14} className="animate-spin" /> : "Publish"}
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-5 bg-gray-50">
        <div className="max-w-4xl mx-auto space-y-4">

      {/* Basics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>
                Tagline{" "}
                <span className="text-gray-400 font-normal">
                  (shown below the title on the listing card)
                </span>
              </Label>
              <Input
                value={content.tagline}
                onChange={(e) => patch({ tagline: e.target.value })}
                placeholder="e.g. AI that ranks resumes by job fit"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>URL slug</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(sanitizeSlugInput(e.target.value))}
              onBlur={() => setSlug(slugifyClient(slug))}
              placeholder="ai-resume-screener"
            />
            <p className="text-xs text-gray-500">
              Public page URL:{" "}
              <span className="font-mono text-gray-700">/ai-products/{slug || "…"}</span>
              {" "}— must be unique. Changing it breaks existing links to this page.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Short description</Label>
            <Textarea
              value={content.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Shown under the title and on the listing card"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Project website URL{" "}
              <span className="text-gray-400 font-normal">
                (shows a “Visit Website” button on the detail page)
              </span>
            </Label>
            <Input
              value={content.websiteUrl}
              onChange={(e) => patch({ websiteUrl: e.target.value })}
              placeholder="https://your-project.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Type a tag and press Enter (e.g. Analytics)"
              />
              <Button type="button" variant="outline" size="icon" onClick={addTag}>
                <Plus size={16} />
              </Button>
            </div>
            {content.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {content.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => patch({ tags: content.tags.filter((t) => t !== tag) })}
                    >
                      <X size={11} />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <ImageUploadField
            label="Thumbnail (listing card image)"
            value={content.thumbnailUrl}
            onChange={(thumbnailUrl) => patch({ thumbnailUrl })}
            hint="800×800px (square) — shown at 72×72 on the listing card"
            previewClassName="h-24 w-24 rounded border object-cover"
          />
        </CardContent>
      </Card>

      {/* Team */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Team name</Label>
            <Input
              value={content.team.name}
              onChange={(e) => patch({ team: { ...content.team, name: e.target.value } })}
              placeholder="e.g. Team Alpha"
            />
          </div>

          <div className="space-y-2">
            <Label>Members</Label>
            {content.team.members.map((member, i) => (
              <div key={i} className="flex items-start gap-2 border rounded-md p-3 bg-gray-50">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <Input
                    value={member.name}
                    onChange={(e) => updateMember(i, { name: e.target.value })}
                    placeholder="Name"
                  />
                  <Input
                    value={member.role || ""}
                    onChange={(e) => updateMember(i, { role: e.target.value })}
                    placeholder="Role / company (e.g. Google)"
                  />
                  <ImageUploadField
                    value={member.avatarUrl || ""}
                    onChange={(avatarUrl) => updateMember(i, { avatarUrl })}
                    placeholder="Avatar URL or upload"
                    hint="200×200px (square)"
                    previewClassName="h-8 w-8 rounded-full object-cover border"
                  />
                  <Input
                    value={member.linkedinUrl || ""}
                    onChange={(e) => updateMember(i, { linkedinUrl: e.target.value })}
                    placeholder="LinkedIn URL"
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    patch({
                      team: {
                        ...content.team,
                        members: content.team.members.filter((_, j) => j !== i),
                      },
                    })
                  }
                >
                  <Trash2 size={15} className="text-red-500" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() =>
                patch({
                  team: {
                    ...content.team,
                    members: [...content.team.members, { name: "" }],
                  },
                })
              }
            >
              <Plus size={14} />
              Add member
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Hero media slider */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hero media</CardTitle>
          <p className="text-sm text-gray-500 font-normal">
            Shown as a slider on the product page. Mix images and YouTube videos;
            drag to reorder.
          </p>
        </CardHeader>
        <CardContent>
          <HeroMediaBuilder
            items={content.heroMedia}
            onChange={(heroMedia) => patch({ heroMedia })}
          />
        </CardContent>
      </Card>

      {/* Sections */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Page sections</CardTitle>
          <p className="text-sm text-gray-500 font-normal">
            Problem Statement, Solution Overview, Tools Used, How We Built It, Key Learnings —
            add and reorder freely.
          </p>
        </CardHeader>
        <CardContent>
          <SectionBuilder
            sections={content.sections}
            onChange={(sections) => patch({ sections })}
          />
        </CardContent>
      </Card>

      {/* Bottom save */}
      <div className="flex justify-end">
        <Button onClick={() => handleSave()} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save changes
        </Button>
      </div>

        </div>
      </div>
    </div>
  );
}
