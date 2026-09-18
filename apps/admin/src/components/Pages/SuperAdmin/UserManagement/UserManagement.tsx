"use client";

import { useEffect, useState } from "react";
import { Edit, PlusCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNotification } from "@/helpers/NotificationContext";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  getAllUsers,
  updateUsers,
  deleteUser,
  IUpdateUser,
  inviteUser,
} from "@/services/auth/authService";
import AddUserDialog from "./AddUserDialog/AddUserDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
import { HoverLoading } from "@/components/Common/Loading/HoverLoading";

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  profile_picture: string | null;
  inviteToken: string;
  role: "admin" | "creator" | "contributor" | string;
  createdAt: string;
  updatedAt: string;
}

export default function UserManagement() {
  const { showNotification } = useNotification();

  const [users, setUsers] = useState<User[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // ✅ FIX: track which user is being deleted
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const roles = ["all", ...new Set(["admin", "creator", "sales"])];

  const filteredUsers =
    selectedRole.toLowerCase() === "all"
      ? users
      : users.filter((q) => q.role === selectedRole);

  const handleAddUser = async (newUser: User) => {
    setIsLoading(true);
    const response = await inviteUser(newUser);

    if (response && response.inviteLink) {
      setUsers((prev) => [...prev, newUser]);
      showNotification("success", "User Added", "User added successfully!");
    } else {
      showNotification("error", "User Addition Failed", "Failed to add user.");
    }

    setIsLoading(false);
  };

  const handleEditUser = async (id: number, updatedUser: IUpdateUser) => {
    try {
      const response = await updateUsers(id, updatedUser);

      if (response) {
        setUsers((prev) =>
          prev.map((user) =>
            user.id === id ? { ...user, ...response.user } : user,
          ),
        );

        showNotification(
          "success",
          "User Updated",
          "User updated successfully!",
        );
      }
    } catch (error) {
      console.error(error);
      showNotification("error", "Update Failed", "Failed to update user.");
    }
  };

  const handleDeleteUser = async () => {
    if (selectedUserId === null) return;

    try {
      await deleteUser(selectedUserId);

      setUsers((prev) => prev.filter((user) => user.id !== selectedUserId));

      showNotification("success", "User Deleted", "User removed successfully!");
    } catch (error) {
      console.error(error);
      showNotification("error", "Delete Failed", "Failed to delete user.");
    } finally {
      setDeleteDialogOpen(false);
      setSelectedUserId(null);
    }
  };

  // ✅ FIX: pass ID here
  const handleDeleteClick = (id: number) => {
    setSelectedUserId(id);
    setDeleteDialogOpen(true);
  };

  const getAllUsersFn = async () => {
    try {
      const response = await getAllUsers();
      if (response?.users) {
        setUsers(response.users);
      }
    } catch (error) {
      console.error(error);
      showNotification("error", "Fetch Failed", "Failed to fetch users.");
    }
  };

  useEffect(() => {
    getAllUsersFn();
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <div className="px-5 h-16 flex justify-between items-center border-b">
        <div className="flex items-center gap-2">
          <SidebarTrigger size={"lg"} />
          <p className="text-lg font-semibold">User Management</p>
        </div>

        <div className="flex gap-4">
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select Category" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={() => {
              setEditingUser(null);
              setIsDialogOpen(true);
            }}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </div>
      </div>

      {isLoading ? (
        <HoverLoading title="Fetching users..." />
      ) : (
        <div className="p-5 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge>{user.role}</Badge>
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setEditingUser(user);
                          setIsDialogOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDeleteClick(user.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* ✅ SINGLE GLOBAL DELETE DIALOG */}
          <AlertDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the
                  user.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteUser}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AddUserDialog
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            onAddUser={handleAddUser}
            onEditUser={handleEditUser}
            editMode={!!editingUser}
            initialData={editingUser}
            roles={roles.filter((r) => r !== "all")}
          />
        </div>
      )}
    </div>
  );
}
