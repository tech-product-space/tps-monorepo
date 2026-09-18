"use client";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  getAllTypes,
  getUserProfile,
  getUsersByType,
} from "@/services/profile/formService";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface UserProfile {
  id: number;
  userId: number;
  type: string;
  name: string;
  email: string;
  mobile: string;
  query: string | null;
  company: string;
  current_role: string;
  linkedin: string;
  target_domain: string | null;
  question_type: string | null;
  date: string | null;
  time: string | null;
  referral_code: string | null;
  best_describe_you: string | null;
  best_describe_your_role: string | null;
  designation: string | null;
  createdAt: string;
  updatedAt: string;
}

const FormLeads = () => {
  const [types, setTypes] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string>("");
  const [usersByType, setUsersByType] = useState<UserProfile[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  const getAllTypesFn = async () => {
    try {
      const response = await getAllTypes();
      setTypes(response.data || []);
      handleTypeChange(response.data[0]);
    } catch (error) {
      console.error("Failed to get types:", error);
    }
  };

  const changeTextFormat = (type: string) => {
    return type
      .replace(/_/g, " ")
      .replace(
        /\w\S*/g,
        (word) => word.charAt(0).toUpperCase() + word.slice(1)
      );
  };

  const handleTypeChange = async (type: string) => {
    setSelectedType(type);
    try {
      const response = await getUsersByType(type);
      setUsersByType(response.data || []);
    } catch (error) {
      console.error("Failed to get users by type:", error);
    }
  };

  const getUserProfileFn = async (userId: number) => {
    const requestBody = {
      user_id: userId,
      type: selectedType,
    };
    try {
      const response = await getUserProfile(requestBody);
      console.log(response);
      setOpenDialog(true);
    } catch (error) {
      console.error("Failed to get types:", error);
    }
  };

  const handleOpenDialog = (user: UserProfile) => {
    setSelectedUser(user);
    getUserProfileFn(user.userId);
  };

  useEffect(() => {
    getAllTypesFn();
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <div className="px-5 h-16 flex justify-between items-center border-b">
        <div className="flex items-center gap-2">
          <SidebarTrigger size={"lg"} />
          <p className="text-lg font-semibold">Form Leads</p>
        </div>
      </div>

      <div className="flex flex-col h-full flex-1 overflow-auto p-5">
        <div className="mb-4 max-w-xs">
          <Select value={selectedType} onValueChange={handleTypeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select a form type" />
            </SelectTrigger>
            <SelectContent>
              {types.map((type) => (
                <SelectItem key={type} value={type}>
                  {changeTextFormat(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedType && (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Current Role</TableHead>
                  <TableHead>LinkedIn</TableHead>
                  <TableHead>Target Domain</TableHead>
                  <TableHead>Question Type</TableHead>
                  <TableHead>Referral Code</TableHead>
                  <TableHead>Best Describe You</TableHead>
                  <TableHead>Best Describe Role</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Created At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersByType.length > 0 ? (
                  usersByType.map((user) => (
                    <TableRow
                      key={user.id}
                      onClick={() => handleOpenDialog(user)}
                    >
                      <TableCell>
                        {new Date(user.updatedAt).toLocaleString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.mobile}</TableCell>
                      <TableCell>{user.company}</TableCell>
                      <TableCell>{user.current_role || "-"}</TableCell>
                      <TableCell>{user.linkedin || "-"}</TableCell>
                      <TableCell>{user.target_domain || "-"}</TableCell>
                      <TableCell>{user.question_type || "-"}</TableCell>
                      <TableCell>{user.referral_code || "-"}</TableCell>
                      <TableCell>{user.best_describe_you || "-"}</TableCell>
                      <TableCell>
                        {user.best_describe_your_role || "-"}
                      </TableCell>
                      <TableCell>{user.designation || "-"}</TableCell>
                      <TableCell>
                        {new Date(user.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={14}
                      className="text-center text-gray-500"
                    >
                      No users found for selected type.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-3 mt-4 text-sm">
              {Object.entries(selectedUser).map(([key, value]) => {
                // Skip unwanted keys and empty values
                if (
                  [
                    "id",
                    "userId",
                    "type",
                    "createdAt",
                    "updatedAt",
                    "date",
                    "time",
                  ].includes(key) ||
                  value === null ||
                  value === undefined ||
                  value === "" ||
                  // Skip if value looks like an ISO date/time string
                  (typeof value === "string" &&
                    /^\d{4}-\d{2}-\d{2}T\d/.test(value))
                ) {
                  return null;
                }

                return (
                  <div key={key} className="flex justify-between border-b pb-1">
                    <span className="font-medium capitalize">
                      {key.replace(/_/g, " ")}
                    </span>
                    <span className="text-muted-foreground text-right max-w-xs break-words">
                      {key === "linkedin" ? (
                        <span
                          onClick={() => {
                            const url = (value as string).startsWith("http")
                              ? (value as string)
                              : `https://${value}`;
                            window.open(url, "_blank", "noopener,noreferrer");
                          }}
                          className="text-blue-600 underline cursor-pointer"
                        >
                          {value}
                        </span>
                      ) : (
                        value
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FormLeads;
