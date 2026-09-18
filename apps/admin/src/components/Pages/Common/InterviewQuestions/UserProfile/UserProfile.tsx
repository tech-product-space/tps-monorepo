"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { getUserById } from "@/services/user/user";
import Image from "next/image";
import { ADMIN_AUTHOR_ID } from "../constants";

interface UserProfileDialogProps {
  userId: string;
}

const UserProfileDialog = ({ userId }: UserProfileDialogProps) => {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Admin-authored questions/answers have no real user profile — hide the action.
  if (!userId || userId === String(ADMIN_AUTHOR_ID) || userId === "null") {
    return null;
  }

  const fallbackImage = "https://cdn-icons-png.flaticon.com/512/149/149071.png"; // dummy avatar

  const handleOpen = async () => {
    setOpen(true);
    setLoading(true);

    try {
      const data = await getUserById(userId);
      setUser(data);
    } catch (error) {
      console.error("Error fetching user profile:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* BUTTON */}
      <Button
        onClick={handleOpen}
        variant="outline"
        className="h-8 text-sm rounded-md border-gray-400 text-gray-700 
          hover:bg-gray-100 hover:border-gray-500 transition-all"
      >
        View Profile
      </Button>

      {/* DIALOG */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-xl p-6 shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              User Profile
            </DialogTitle>
            <DialogDescription>Information about this user.</DialogDescription>
          </DialogHeader>

          {/* LOADING */}
          {loading && (
            <p className="text-center py-6 text-gray-600 text-sm">
              Loading profile...
            </p>
          )}

          {/* USER DATA */}
          {!loading && user && (
            <div className="mt-4 space-y-5">
              {/* TOP SECTION */}
              <div className="flex items-center gap-4">
                <div className="w-[70px] h-[70px] rounded-full overflow-hidden border shadow-sm">
                  <Image
                    src={user.profile_picture || fallbackImage}
                    alt={user.name}
                    width={70}
                    height={70}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = fallbackImage;
                    }}
                  />
                </div>
                <div>
                  <p className="text-lg font-semibold capitalize">
                    {user.name}
                  </p>
                  <p className="text-sm text-gray-600">{user.email}</p>
                </div>
              </div>

              {/* DIVIDER */}
              <div className="border-t" />

              {/* DETAILS */}
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium">Joined:</span>{" "}
                  {new Date(user.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UserProfileDialog;
