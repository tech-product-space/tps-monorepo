"use client";

import type React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Users, Check, X, Briefcase, GraduationCap } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { BulkAction } from "../bulk-actions";

interface IGuest {
  id: number;
  name: string;
  phone: string;
  linkedin: string;
  role: string;
  userType: string;
  eventType: string;
  guestType: "Approved" | "Waitlist" | "Declined";
  eventName: string;
  userId: number;
  createdAt: string;
  updatedAt: string;
  user: {
    email: string;
    profile_picture?: string;
  };
}

interface GuestProps {
  guests: IGuest[];
  handleAcceptGuest: (guestId: number) => void;
  handleDeclineGuest: (guestId: number) => void;
  getApprovalStatusBadge: (status: IGuest["guestType"]) => React.ReactNode;
  getTimeAgo: (dateString: string) => string;
  handleBulkReschedule: () => void;
  handleBulkAccept: (action: BulkAction) => void;
  handleBulkDecline: (action: BulkAction) => void;
  selectedGuests: number[];
  setSelectedGuests: React.Dispatch<React.SetStateAction<number[]>>;
}

const Guest: React.FC<GuestProps> = ({
  guests,
  handleAcceptGuest,
  getApprovalStatusBadge,
  handleDeclineGuest,
  getTimeAgo,
  handleBulkReschedule,
  handleBulkAccept,
  handleBulkDecline,
  selectedGuests,
  setSelectedGuests,
}) => {
  const router = useRouter();
  const pathname = usePathname();

  const totalGuests = guests.length;
  const approvedGuests = guests.filter(
    (guest) => guest.guestType === "Approved"
  ).length;
  const pendingGuests = guests.filter(
    (guest) => guest.guestType === "Waitlist"
  ).length;
  const declinedGuests = guests.filter(
    (guest) => guest.guestType === "Declined"
  ).length;

  // const handleSelectGuest = (guestId: number, checked: boolean) => {
  //   if (checked) {
  //     setSelectedGuests((prev) => [...prev, guestId]);
  //   } else {
  //     setSelectedGuests((prev) => prev.filter((id) => id !== guestId));
  //   }
  // };

  const openGuestDetails = () => {
    if (pathname) {
      const parts = pathname.split("/");
      const id = parts[parts.length - 1];
      router.push(`${id}/guest-list`);
    }
  };

  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [openConfirm, setOpenConfirm] = useState(false);

  const BULK_ACTION_COPY: Record<
    BulkAction,
    {
      title: string;
      body: string;
      confirmLabel: string;
      isApprove: boolean;
    }
  > = {
    APPROVE_ALL: {
      title: "Approve All Registrations?",
      body: "You are about to approve all waitlisted registrations for this event.",
      confirmLabel: "Yes, Approve All",
      isApprove: true,
    },
    APPROVE_PROFESSIONALS: {
      title: "Approve Professional Registrations?",
      body: `You are about to approve all waitlisted professionals for this event.
Students will remain on the waitlist.`,
      confirmLabel: "Yes, Approve Professionals",
      isApprove: true,
    },
    APPROVE_STUDENTS: {
      title: "Approve Student Registrations?",
      body: `You are about to approve all waitlisted students for this event.
Professionals will remain on the waitlist.`,
      confirmLabel: "Yes, Approve Students",
      isApprove: true,
    },
    DECLINE_ALL: {
      title: "Decline All Registrations?",
      body: `You are about to decline all waitlisted registrations.
Declined users will not be able to attend this event.`,
      confirmLabel: "Yes, Decline All",
      isApprove: false,
    },
    DECLINE_PROFESSIONALS: {
      title: "Decline Professional Registrations?",
      body: `You are about to decline all waitlisted professionals.
Students will remain on the waitlist.`,
      confirmLabel: "Yes, Decline Professionals",
      isApprove: false,
    },
    DECLINE_STUDENTS: {
      title: "Decline Student Registrations?",
      body: `You are about to decline all waitlisted students.
Professionals will remain on the waitlist.`,
      confirmLabel: "Yes, Decline Students",
      isApprove: false,
    },
  };

  return (
    <div className="space-y-8">
      {/* Guests Overview */}
      <Card className="border-gray-200 shadow-sm">
        <CardContent>
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium text-green-700">
                    Approved
                  </span>
                </div>
                <div className="text-3xl font-bold text-gray-900">
                  {approvedGuests}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {totalGuests > 0
                    ? Math.round((approvedGuests / totalGuests) * 100)
                    : 0}
                  % of total
                </div>
              </div>

              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span className="text-sm font-medium text-yellow-700">
                    Waitlist
                  </span>
                </div>
                <div className="text-3xl font-bold text-gray-900">
                  {pendingGuests}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {totalGuests > 0
                    ? Math.round((pendingGuests / totalGuests) * 100)
                    : 0}
                  % of total
                </div>
              </div>

              <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span className="text-sm font-medium text-red-700">
                    Declined
                  </span>
                </div>
                <div className="text-3xl font-bold text-gray-900">
                  {declinedGuests}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {totalGuests > 0
                    ? Math.round((declinedGuests / totalGuests) * 100)
                    : 0}
                  % of total
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">Approval Rate</span>
                <span className="font-semibold text-gray-900">
                  {totalGuests > 0
                    ? Math.round((approvedGuests / totalGuests) * 100)
                    : 0}
                  %
                </span>
              </div>
              <Progress
                value={
                  totalGuests > 0 ? (approvedGuests / totalGuests) * 100 : 0
                }
                className="h-3 bg-gray-100 [&>div]:bg-gradient-to-r [&>div]:from-green-500 [&>div]:to-green-600"
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* All Guests */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">All Guests</CardTitle>
          <div className="flex items-center gap-2">
            {/* {approvedGuests > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="select-approved"
                    checked={
                      selectedGuests.length === approvedGuests &&
                      approvedGuests  > 0
                    }
                    onCheckedChange={handleSelectAllApproved}
                  />
                  <label htmlFor="select-approved" className="text-sm font-medium">
                    Select All Approved
                  </label>
                </div>
                <Button
                  onClick={handleBulkReschedule}
                  className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700"
                >
                  <CheckAll className="w-4 h-4" />
                  {selectedGuests.length > 0
                    ? `Reschedule Event (${selectedGuests.length})`
                    : `Reschedule  Event (${pendingGuests})`}
                </Button>
              </div>
            )} */}
            {pendingGuests > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800 flex items-center gap-2"
                  >
                    <Users className="w-4 h-4" />
                    Bulk Actions
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5 text-xs text-gray-500 font-medium">
                    Pending: {pendingGuests} users
                  </div>

                  <DropdownMenuSeparator />

                  <DropdownMenuLabel className="text-green-600 font-semibold">
                    Approve Users
                  </DropdownMenuLabel>

                  <DropdownMenuItem
                    onClick={() => {
                      setBulkAction("APPROVE_ALL");
                      setOpenConfirm(true);
                    }}
                  >
                    <Check className="w-4 h-4 mr-2 text-green-600" />
                    All Pending Users
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => {
                      setBulkAction("APPROVE_PROFESSIONALS");
                      setOpenConfirm(true);
                    }}
                  >
                    <Briefcase className="w-4 h-4 mr-2 text-green-600" />
                    Professionals Only
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => {
                      setBulkAction("APPROVE_STUDENTS");
                      setOpenConfirm(true);
                    }}
                  >
                    <GraduationCap className="w-4 h-4 mr-2 text-green-600" />
                    Students Only
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuLabel className="text-red-600 font-semibold">
                    Decline Users
                  </DropdownMenuLabel>

                  <DropdownMenuItem
                    className="text-red-600 focus:bg-red-50"
                    onClick={() => {
                      setBulkAction("DECLINE_ALL");
                      setOpenConfirm(true);
                    }}
                  >
                    <X className="w-4 h-4 mr-2" />
                    All Pending Users
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    className="text-red-600 focus:bg-red-50"
                    onClick={() => {
                      setBulkAction("DECLINE_PROFESSIONALS");
                      setOpenConfirm(true);
                    }}
                  >
                    <Briefcase className="w-4 h-4 mr-2" />
                    Professionals Only
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    className="text-red-600 focus:bg-red-50"
                    onClick={() => {
                      setBulkAction("DECLINE_STUDENTS");
                      setOpenConfirm(true);
                    }}
                  >
                    <GraduationCap className="w-4 h-4 mr-2" />
                    Students Only
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Button
              onClick={() => openGuestDetails()}
              className="flex items-center gap-2"
            >
              Guest Details
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {guests.map((guest) => (
              <div
                key={guest.id}
                className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200"
              >
                <div className="flex items-center gap-4">
                  <Avatar className="w-12 h-12 border-2 border-white shadow-sm">
                    <AvatarImage
                      src={guest.user.profile_picture || "/placeholder.svg"}
                      alt={guest.name}
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-gradient-to-br from-blue-400 to-purple-500 text-white font-medium">
                      {guest.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-gray-900">
                        {guest.name}
                      </h4>
                      <div className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {guest.role}
                      </div>
                    </div>

                    <p className="text-sm text-gray-600">{guest.user.email}</p>

                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="capitalize">{guest.userType}</span>
                      <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                      <span>{getTimeAgo(guest.createdAt)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {getApprovalStatusBadge(guest.guestType)}

                  {guest.guestType === "Waitlist" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-200 hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition-colors"
                        onClick={() => handleAcceptGuest(guest.userId)}
                        title="Accept guest"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors"
                        onClick={() => handleDeclineGuest(guest.userId)}
                        title="Decline guest"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Dialog open={openConfirm} onOpenChange={setOpenConfirm}>
        <DialogContent>
          {bulkAction && (
            <>
              <DialogHeader>
                <DialogTitle>{BULK_ACTION_COPY[bulkAction].title}</DialogTitle>
              </DialogHeader>

              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {BULK_ACTION_COPY[bulkAction].body}
              </p>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setOpenConfirm(false)}>
                  Cancel
                </Button>

                <Button
                  className={
                    BULK_ACTION_COPY[bulkAction].isApprove
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-red-600 hover:bg-red-700"
                  }
                  onClick={() => {
                    setOpenConfirm(false);

                    if (BULK_ACTION_COPY[bulkAction].isApprove) {
                      handleBulkAccept(bulkAction);
                    } else {
                      handleBulkDecline(bulkAction);
                    }
                  }}
                >
                  {BULK_ACTION_COPY[bulkAction].confirmLabel}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Guest;
