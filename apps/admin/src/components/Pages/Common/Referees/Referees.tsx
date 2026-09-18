"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { HoverLoading } from "@/components/Common/Loading/HoverLoading";
import {
  addCohortMember,
  getAllReferees,
  getReferralsById,
  updateCohortMember,
  deleteCohortMember,
} from "@/services/referral/referralServices";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ReferralTable } from "./ReferralTable/ReferralTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNotification } from "@/helpers/NotificationContext";
import { Switch } from "@/components/ui/switch"


const cohortMemberSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  email: z.string().email("Invalid email format").optional().or(z.literal("")),
  phone: z.string().optional(),
  type: z.enum(["student", "professional"], {
    required_error: "Please select a type",
  }),
});

type CohortMemberFormData = z.infer<typeof cohortMemberSchema>;

export interface ReferralSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  referralCode: string;
  memberCount: string;
  type: string;
}

export interface ReferredMember {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface ReferralWithMembers {
  referralId: string;
  referralCode: string;
  referredMembers: ReferredMember[];
}

export const Referees = () => {
  const [referrals, setReferrals] = useState<ReferralSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [open, setOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] =
    useState<ReferralWithMembers | null>(null);
  const [selectedReferrer, setSelectedReferrer] = useState<string>("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingMember, setEditingMember] = useState<ReferralSummary | null>(
    null
  );
  const [deletingMember, setDeletingMember] = useState<ReferralSummary | null>(
    null
  );
  const [adding, setAdding] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { showNotification } = useNotification();

  const addForm = useForm<CohortMemberFormData>({
    resolver: zodResolver(cohortMemberSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      type: undefined,
    },
  });

  const editForm = useForm<CohortMemberFormData>({
    resolver: zodResolver(cohortMemberSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      type: undefined,
    },
  });

  const getAllReferralsFn = async () => {
    try {
      const data = await getAllReferees();
      setReferrals(data);
    } catch {
      showNotification("error", "Error", "Failed to fetch referrals");
    } finally {
      setIsLoading(false);
    }
  };

  const addCohortMemberFn = async (data: CohortMemberFormData) => {
    setAdding(true);
    try {
      const res = await addCohortMember(data);
      if (res.message === "Referral created") {
        setShowAddDialog(false);
        addForm.reset();
        await getAllReferralsFn();
        showNotification(
          "success",
          "Success",
          "Cohort member added successfully"
        );
      } else {
        showNotification("error", "Error", "Failed to add cohort member");
      }
    } catch {
      showNotification(
        "error",
        "Error",
        "An error occurred while adding the member"
      );
    } finally {
      setAdding(false);
    }
  };

  const updateCohortMemberFn = async (data: CohortMemberFormData) => {
    if (!editingMember) return;
    setUpdating(true);
    try {
      const res = await updateCohortMember(editingMember.id, data);
      if (res.success) {
        setShowEditDialog(false);
        setEditingMember(null);
        editForm.reset();
        await getAllReferralsFn();
        showNotification(
          "success",
          "Success",
          "Cohort member updated successfully"
        );
      } else {
        showNotification("error", "Error", "Failed to update cohort member");
      }
    } catch {
      showNotification(
        "error",
        "Error",
        "An error occurred while updating the member"
      );
    } finally {
      setUpdating(false);
    }
  };

  const deleteCohortMemberFn = async () => {
    if (!deletingMember) return;
    setDeleting(true);
    try {
      const res = await deleteCohortMember(deletingMember.id);
      if (res.success) {
        setShowDeleteDialog(false);
        setDeletingMember(null);
        await getAllReferralsFn();
        showNotification(
          "success",
          "Success",
          "Cohort member deleted successfully"
        );
      } else {
        showNotification("error", "Error", "Failed to delete cohort member");
      }
    } catch {
      showNotification(
        "error",
        "Error",
        "An error occurred while deleting the member"
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleViewUsers = async (id: string) => {
    try {
      const data = await getReferralsById(id);
      setSelectedUsers(data);
      const refUser = referrals.find((r) => r.id === id);
      setSelectedReferrer(refUser?.name || "Unknown");
      setOpen(true);
    } catch {
      showNotification("error", "Error", "Failed to fetch referred users");
    }
  };

  const handleEditMember = (member: ReferralSummary) => {
    setEditingMember(member);
    editForm.reset({
      name: member.name,
      email: member.email || "",
      phone: member.phone || "",
      type: member.type as "student" | "professional",
    });
    setShowEditDialog(true);
  };

  const handleDeleteMember = (member: ReferralSummary) => {
    setDeletingMember(member);
    setShowDeleteDialog(true);
  };

  const copyReferralLink = (referralCode: string) => {
    const referralUrl = `https://theproductspace.in/referral?id=${referralCode}`;
    navigator.clipboard
      .writeText(referralUrl)
      .then(() => {
        showNotification(
          "success",
          "Success",
          "Referral link copied to clipboard"
        );
      })
      .catch(() => {
        showNotification("error", "Error", "Failed to copy referral link");
      });
  };

  useEffect(() => {
    getAllReferralsFn();
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <div className="px-5 h-16 flex justify-between items-center border-b">
        <div className="flex items-center gap-2">
          <SidebarTrigger size={"lg"} />
          <p className="text-lg font-semibold">Referees</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className="m-4 self-end">
          + Add Referee
        </Button>
      </div>

      {isLoading ? (
        <HoverLoading title="Please wait while we fetch referrals..." />
      ) : (
        <div className="flex flex-col h-full overflow-auto">
          <ReferralTable
            referrals={referrals}
            onViewReferredUsers={handleViewUsers}
            onEditMember={handleEditMember}
            onDeleteMember={handleDeleteMember}
            copyReferralLink={copyReferralLink}
          />
        </div>
      )}

      {/* View Referred Users Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Users Referred by {selectedReferrer}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!selectedUsers || selectedUsers.referredMembers.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No referred users yet.
              </p>
            ) : (
              <ul className="divide-y border rounded-md">
                {selectedUsers.referredMembers.map((user) => (
                  <li
                    key={user.id}
                    className="flex justify-between items-center px-4 py-2"
                  >
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {user.email}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {user.phone}
                      </p>
                    </div>
                    <span className="text-xs bg-muted px-2 py-1 rounded-md">
                      {selectedUsers.referralCode}
                    </span>
                          <Switch/>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Referee Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Referee</DialogTitle>
          </DialogHeader>

          <Form {...addForm}>
            <form
              onSubmit={addForm.handleSubmit(addCohortMemberFn)}
              className="space-y-4"
            >
              <FormField
                control={addForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={addForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="Enter email (optional)"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={addForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter phone (optional)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={addForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pm_fellowship">PM Fellowship</SelectItem>
                        <SelectItem value="ai_for_pm">
                          AI for PM
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={adding} className="w-full">
                {adding ? "Adding..." : "Add Member"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Cohort Member</DialogTitle>
          </DialogHeader>

          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit(updateCohortMemberFn)}
              className="space-y-4"
            >
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="Enter email (optional)"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter phone (optional)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="professional">
                          Professional
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditDialog(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updating} className="flex-1">
                  {updating ? "Updating..." : "Update Member"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete{" "}
              <strong>{deletingMember?.name}</strong> and all their referral
              data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteCohortMemberFn}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
