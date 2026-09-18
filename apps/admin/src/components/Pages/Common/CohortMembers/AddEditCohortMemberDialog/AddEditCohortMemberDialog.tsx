"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CohortMember,
  createCohortMember,
  updateCohortMember,
} from "@/services/cohort-members/cohort-members";
import { z } from "zod";
import { useNotification } from "@/helpers/NotificationContext";
import { Textarea } from "@/components/ui/textarea";


const CohortMemberSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z
    .string()
    .min(7, "Phone number is too short")
    .optional()
    .or(z.literal("")),
  course: z.string().min(1, "Course is required"),
  cohort: z.string().min(1, "Cohort is required"),
  role: z.string().min(1, "Role is required"),
  status: z.enum(["Active", "Inactive"]),
});


type FormState = z.infer<typeof CohortMemberSchema>;
type FormErrors = Partial<Record<keyof FormState, string>>;


const DEFAULT_FORM: FormState = {
  name: "",
  email: "",
  phone: "",
  course: "",
  cohort: "",
  role: "",
  status: "Active",
};

interface Props {
  open: boolean;
  member: CohortMember | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddEditCohortMemberDialog = ({
  open,
  member,
  onClose,
  onSuccess,
}: Props) => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [errors, setErrors] = useState<FormErrors>({});

  const isEditMode = !!member;

  useEffect(() => {
    if (member) {
      setForm({
        name: member.user?.name || "",
        email: member.user?.email || "",
        phone: member.user?.phone || "",
        course: member.course || "",
        cohort: member.cohort || "",
        role: member.role || "",
        status: member.status as "Active" | "Inactive",
      });
    } else {
      resetForm();
    }
  }, [member, open]);

  const resetForm = () => {
    setForm(DEFAULT_FORM);
    setErrors({});
  };

  const setField = <K extends keyof FormState>(
    field: K,
    value: FormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };


  const handleSubmit = async () => {
    const validation = CohortMemberSchema.safeParse(form);

    if (!validation.success) {
      const fieldErrors: FormErrors = {};
      validation.error.errors.forEach((err) => {
        const field = err.path[0] as keyof FormState;
        fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);

    try {
      if (member) {
        await updateCohortMember(member.id, {
          course: form.course,
          cohort: form.cohort,
          role: form.role,
          status: form.status,
        });

        showNotification(
          "success",
          "Member Updated",
          "Cohort member updated successfully."
        );
      } else {
        await createCohortMember(form);

        showNotification(
          "success",
          "Member Added",
          "Cohort member added successfully."
        );
      }

      resetForm();
      onSuccess();
      onClose();
    } catch (error: any) {
      showNotification(
        "error",
        "Action Failed",
        error?.response?.data?.message ||
          "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose} >
      <DialogContent className="w-[40vw]">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Cohort Member" : "Add Cohort Member"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* ADD MODE ONLY (HIDDEN IN EDIT) */}
          {!isEditMode && (
            <>
              <Field label="Name" error={errors.name}>
                <Input
                  placeholder="Enter the name"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                />
              </Field>

              <Field label="Email" error={errors.email}>
                <Input
                  placeholder="Enter the email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                />
              </Field>

              <Field label="Phone" error={errors.phone}>
                <Input
                  placeholder="Enter the phone number"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                />
              </Field>
            </>
          )}

          <Field label="Course" error={errors.course}>
            <Select
              value={form.course}
              onValueChange={(v) => setField("course", v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Advanced AI Program">
                  Advanced AI Program
                </SelectItem>
                <SelectItem value="Product Management Fellowship">
                  Product Management Fellowship
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Cohort" error={errors.cohort}>
            <Input
              placeholder="Enter the cohort"
              value={form.cohort}
              onChange={(e) => setField("cohort", e.target.value)}
            />
          </Field>

          <Field label="Role" error={errors.role}>
            <Textarea
              placeholder="Enter the role"
              value={form.role}
              onChange={(e) => setField("role", e.target.value)}
            />
          </Field>

          <Field label="Status">
            <Select
              value={form.status}
              onValueChange={(v) =>
                setField("status", v as "Active" | "Inactive")
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Field = ({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <div className="grid gap-1">
    <Label>{label}</Label>
    {children}
    {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
  </div>
);
