"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { updateInterviewQuestion } from "@/services/interview-questions/interview-question-service";
import { ROLE_OPTIONS, TYPE_OPTIONS } from "../CreateQuestion/questionOptions";

interface EditQuestionDialogProps {
  question: {
    _id: string;
    title: string;
    company?: string;
    role?: string | string[];
    type?: string | string[];
    phone?: string;
    isPublished?: boolean;
  };
  onUpdated: () => void;
}

const toArray = (v?: string | string[]): string[] =>
  Array.isArray(v) ? v.filter(Boolean) : v ? [v] : [];

export default function EditQuestionDialog({
  question,
  onUpdated,
}: EditQuestionDialogProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [roleOther, setRoleOther] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [typeOther, setTypeOther] = useState("");
  const [isPublished, setIsPublished] = useState(false);

  // Load current values whenever the dialog opens.
  const hydrate = () => {
    setTitle(question.title || "");
    setCompany(question.company || "");
    setPhone(question.phone || "");
    setIsPublished(!!question.isPublished);

    const roleArr = toArray(question.role);
    const firstRole = roleArr[0] || "";
    if (!firstRole) {
      setSelectedRole("");
      setRoleOther("");
    } else if (ROLE_OPTIONS.includes(firstRole)) {
      setSelectedRole(firstRole);
      setRoleOther("");
    } else {
      setSelectedRole("Other");
      setRoleOther(firstRole);
    }

    const typeArr = toArray(question.type);
    const known = typeArr.filter((t) => TYPE_OPTIONS.includes(t));
    const unknown = typeArr.filter((t) => !TYPE_OPTIONS.includes(t));
    setSelectedTypes(unknown.length ? [...known, "Other"] : known);
    setTypeOther(unknown.join(", "));
  };

  const handleOpenChange = (next: boolean) => {
    if (next) hydrate();
    setOpen(next);
  };

  const toggleType = (t: string) =>
    setSelectedTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Question title is required.");
      return;
    }

    const resolvedRole =
      selectedRole === "Other" ? roleOther.trim() : selectedRole;
    const resolvedTypes = selectedTypes.flatMap((t) =>
      t === "Other"
        ? typeOther
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [t]
    );

    try {
      setSaving(true);
      await updateInterviewQuestion(question._id, {
        title: title.trim(),
        company: company.trim(),
        phone: phone.trim(),
        role: resolvedRole ? [resolvedRole] : [],
        type: resolvedTypes,
        isPublished,
      });
      toast.success("Question updated.");
      setOpen(false);
      onUpdated();
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Failed to update question. Please try again.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil className="h-4 w-4 mr-1" />
          Edit Question
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Question</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">
              Question <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-company">Company</Label>
              <Input
                id="edit-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-role">Role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger id="edit-role" className="w-full">
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
              <Label htmlFor="edit-roleOther">Specify the role</Label>
              <Input
                id="edit-roleOther"
                value={roleOther}
                onChange={(e) => setRoleOther(e.target.value)}
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
              <Label htmlFor="edit-typeOther">
                Specify the type(s){" "}
                <span className="text-muted-foreground">(comma separated)</span>
              </Label>
              <Input
                id="edit-typeOther"
                value={typeOther}
                onChange={(e) => setTypeOther(e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Phone (optional)</Label>
              <Input
                id="edit-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <Label className="text-sm font-medium">Published</Label>
              <Switch checked={isPublished} onCheckedChange={setIsPublished} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
