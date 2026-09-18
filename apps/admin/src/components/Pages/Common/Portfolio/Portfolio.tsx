"use client";

import { useEffect, useState, useMemo } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HoverLoading } from "@/components/Common/Loading/HoverLoading";
import Image from "next/image";
import { useNotification } from "@/helpers/NotificationContext";
import {
  ActiveUser,
  getPortfolioUsers,
  toggleUserPublishStatus,
} from "@/services/portfolio/portfolioServices";
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

export default function Portfolios() {
  const { showNotification } = useNotification();
  const [users, setUsers] = useState<ActiveUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ActiveUser | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  // Fetch all users
  const getAllUsersFn = async () => {
    setIsLoading(true);
    try {
      const response = await getPortfolioUsers();
      if (response) setUsers(response.data || []);
    } catch (error) {
      console.error("Error fetching users:", error);
      showNotification("error", "Fetch Failed", "Failed to fetch users.");
    } finally {
      setIsLoading(false);
    }
  };

  const username = (name?: string) => {
    if (name) return name.toLowerCase().split(" ").join("-");
  };

  const handleUserClick = (userId: number, userName: string) => {
    try {
      window.open(
        `https://theproductspace.in/portfolio/${username(userName)}-${userId}`,
        "_blank"
      );
    } catch (error) {
      console.error("Error opening portfolio:", error);
      showNotification("error", "Error", "Failed to open portfolio.");
    }
  };

  const handleToggleClick = (e: React.MouseEvent, user: ActiveUser) => {
    e.stopPropagation();
    setSelectedUser(user);
    setDialogOpen(true);
  };

  const handleConfirmToggle = async () => {
    if (!selectedUser) return;

    setIsToggling(true);
    try {
      const response = await toggleUserPublishStatus(selectedUser.userId);

      if (response) {
        setUsers((prevUsers) =>
          prevUsers.map((u) =>
            u.userId === selectedUser.userId
              ? { ...u, isPublished: !u.isPublished }
              : u
          )
        );

        showNotification(
          "success",
          "Status Updated",
          `Portfolio has been ${
            !selectedUser.isPublished ? "published" : "unpublished"
          } successfully.`
        );
      }
    } catch (error) {
      console.error("Error toggling publish status:", error);
      showNotification(
        "error",
        "Update Failed",
        "Failed to update publish status."
      );
    } finally {
      setIsToggling(false);
      setDialogOpen(false);
      setSelectedUser(null);
    }
  };

  const getCompletionBadge = (user: ActiveUser) => {
    const sections = [
      user.WorkExperience,
      user.PortfolioProject,
      user.PersonalInfo,
      user.Education,
      user.Achievement,
    ];
    const completedCount = sections.filter(Boolean).length;
    const percentage = (completedCount / sections.length) * 100;

    if (percentage === 100) {
      return { label: "Complete", variant: "default" as const };
    } else if (percentage >= 60) {
      return { label: "In Progress", variant: "secondary" as const };
    } else if (percentage > 0) {
      return { label: "Started", variant: "outline" as const };
    } else {
      return { label: "Not Started", variant: "destructive" as const };
    }
  };

  // 🔍 Filter users by ID, name, or email
  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const term = searchTerm.toLowerCase().trim();

    return users.filter(
      (u) =>
        u.userId.toString().includes(term) ||
        u.name?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term)
    );
  }, [searchTerm, users]);

  const publishedCount = useMemo(
    () => users.filter((u) => u.isPublished).length,
    [users]
  );

  useEffect(() => {
    getAllUsersFn();
  }, []);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-5 h-16 flex justify-between items-center border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <SidebarTrigger size={"lg"} />
          <p className="text-lg font-semibold">Portfolios</p>
        </div>

        <div className="flex items-center gap-4">
          <p className="text-sm font-medium text-gray-600">
            Published: <span className="font-semibold">{publishedCount}</span>
          </p>
          <Input
            type="text"
            placeholder="Search by Name, Email, or ID"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
          <Button onClick={() => setSearchTerm("")} variant="outline" size="sm">
            Reset
          </Button>
        </div>
      </div>

      {/* Table Section */}
      {isLoading ? (
        <HoverLoading title="Fetching all users..." />
      ) : (
        <div className="flex-1 overflow-hidden p-5 bg-gray-100">
          <div className="h-full overflow-auto border rounded-lg">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Completion</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="bg-white">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => {
                    const completion = getCompletionBadge(user);
                    return (
                      <TableRow
                        key={user.userId}
                        onClick={() => handleUserClick(user.userId, user.name)}
                        className="cursor-pointer hover:bg-gray-100"
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Image
                              src={
                                user.profile_picture ||
                                "https://media.istockphoto.com/id/1337144146/vector/default-avatar-profile-icon-vector.jpg?s=612x612&w=0&k=20&c=BIbFwuv7FxTWvh5S3vB6bkT0Qv8Vn8N5Ffseq84ClGI="
                              }
                              alt={user.name}
                              width={40}
                              height={40}
                              className="h-[40px] w-[40px] rounded-full object-cover"
                            />
                            {user.name}
                          </div>
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge variant={completion.variant}>
                            {completion.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            onClick={(e) => handleToggleClick(e, user)}
                            className={
                              user.isPublished
                                ? "bg-red-400 hover:bg-red-500 text-white"
                                : "bg-green-400 hover:bg-green-500 text-white"
                            }
                            size="sm"
                          >
                            {user.isPublished ? "Unpublish" : "Publish"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6">
                      No users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedUser?.isPublished ? "Unpublish" : "Publish"} Portfolio
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to{" "}
              {selectedUser?.isPublished ? "unpublish" : "publish"}{" "}
              <span className="font-semibold">{selectedUser?.name}'s</span>{" "}
              portfolio?
              {selectedUser?.isPublished ? (
                <span className="block mt-2">
                  This will make the portfolio private and no longer accessible
                  publicly.
                </span>
              ) : (
                <span className="block mt-2">
                  This will make the portfolio public and accessible to everyone.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isToggling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmToggle}
              disabled={isToggling}
            >
              {isToggling ? "Updating..." : "Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}