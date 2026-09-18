"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface AddUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddUser: (user: any) => void;
  onEditUser?: (id: number, user: any) => void;
  roles: string[];
  editMode?: boolean;
  initialData?: any;
}

export default function AddUserDialog({
  open,
  onOpenChange,
  onAddUser,
  onEditUser,
  roles,
  editMode = false,
  initialData,
}: AddUserDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: roles[0],
  });

  const [errors, setErrors] = useState({
    name: "",
    email: "",
  });

  useEffect(() => {
    if (editMode && initialData) {
      setFormData({
        name: initialData.name || "",
        email: initialData.email || "",
        role: initialData.role || roles[0],
      });
    } else {
      setFormData({
        name: "",
        email: "",
        role: roles[0],
      });
    }
    setErrors({ name: "", email: "" });
  }, [editMode, initialData, open]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const validate = () => {
    const newErrors = { name: "", email: "" };
    let isValid = true;

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
      isValid = false;
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Invalid email format";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    if (editMode && initialData?.id) {
      onEditUser?.(initialData.id, formData);
    } else {
      onAddUser(formData);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:min-w-[600px] sm:max-w-fit max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editMode ? "Edit User" : "Invite New User"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Name"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              className={errors.name ? "border-red-500" : ""}
            />
            {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              className={errors.email ? "border-red-500" : ""}
            />
            {errors.email && <p className="text-sm text-red-500">{errors.email}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={formData.role}
              onValueChange={(value) => handleChange("role", value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            {editMode ? "Update User" : "Invite User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
