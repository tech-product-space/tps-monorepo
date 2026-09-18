"use client";

import type React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, Check, X, CheckIcon as CheckAll } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

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
  handleBulkAccept: () => void;
  selectedGuests: number[];
  setSelectedGuests: React.Dispatch<React.SetStateAction<number[]>>;
}

const Guest: React.FC<GuestProps> = ({
  guests,
  handleAcceptGuest,
  getApprovalStatusBadge,
  handleDeclineGuest,
  getTimeAgo,
  handleBulkAccept,
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

  const handleSelectGuest = (guestId: number, checked: boolean) => {
    if (checked) {
      setSelectedGuests((prev) => [...prev, guestId]);
    } else {
      setSelectedGuests((prev) => prev.filter((id) => id !== guestId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const pendingGuestIds = guests
        .filter((guest) => guest.guestType === "Waitlist")
        .map((guest) => guest.userId);
      setSelectedGuests(pendingGuestIds);
    } else {
      setSelectedGuests([]);
    }
  };

  const openGuestDetails = () => {
    if (pathname) {
      const parts = pathname.split("/");
      const id = parts[parts.length - 1];
      router.push(`${id}/guest-list`);
    }
  }

  return (
    <div className="space-y-8">
      {/* Guests Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-green-600 flex items-center gap-2">
            <Users className="w-6 h-6" />
            {totalGuests} guests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {approvedGuests}
                </div>
                <div className="text-sm text-gray-600">Approved</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">
                  {pendingGuests}
                </div>
                <div className="text-sm text-gray-600">Waitlist</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {declinedGuests}
                </div>
                <div className="text-sm text-gray-600">Declined</div>
              </div>
            </div>
            <Progress
              value={totalGuests > 0 ? (approvedGuests / totalGuests) * 100 : 0}
              className="h-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* All Guests */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">All Guests</CardTitle>
          <div className="flex items-center gap-2">
            {pendingGuests > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="select-all"
                    checked={
                      selectedGuests.length === pendingGuests &&
                      pendingGuests > 0
                    }
                    onCheckedChange={handleSelectAll}
                  />
                  <label htmlFor="select-all" className="text-sm font-medium">
                    Select All Waitlist
                  </label>
                </div>
                <Button
                  onClick={handleBulkAccept}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                >
                  <CheckAll className="w-4 h-4" />
                  {selectedGuests.length > 0
                    ? `Approve Selected (${selectedGuests.length})`
                    : `Approve All Waitlist (${pendingGuests})`}
                </Button>
              </div>
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
                className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  {guest.guestType === "Waitlist" && (
                    <Checkbox
                      checked={selectedGuests.includes(guest.userId)}
                      onCheckedChange={(checked) =>
                        handleSelectGuest(guest.userId, checked as boolean)
                      }
                    />
                  )}
                  <Avatar className="w-10 h-10">
                    <AvatarImage
                      src={guest.user.profile_picture || "/placeholder.svg"}
                    />
                    <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                      {guest.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium text-gray-900">
                      {guest.name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {guest.user.email}
                    </div>
                    <div className="text-xs text-gray-400">
                      {guest.role} • {guest.userType}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {getApprovalStatusBadge(guest.guestType)}
                  <span className="text-sm text-gray-500">
                    {getTimeAgo(guest.createdAt)}
                  </span>
                  {guest.guestType === "Waitlist" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-600 hover:bg-green-50 bg-transparent"
                        onClick={() => handleAcceptGuest(guest.userId)}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-600 hover:bg-red-50 bg-transparent"
                        onClick={() => handleDeclineGuest(guest.userId)}
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
    </div>
  );
};

export default Guest;
