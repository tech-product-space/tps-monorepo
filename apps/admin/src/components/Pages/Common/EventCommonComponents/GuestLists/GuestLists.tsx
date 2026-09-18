"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { HoverLoading } from "@/components/Common/Loading/HoverLoading";
import { usePathname, useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Phone, Linkedin, ArrowLeft } from "lucide-react";
import { getAllGuests } from "@/services/Events/eventServices";
import Cookies from "js-cookie";
import { User } from "@/components/Pages/SuperAdmin/UserManagement/UserManagement";

export interface IGuest {
  id: number;
  name: string;
  phone: string;
  linkedin: string;
  role: string;
  graduationYear: string | null;
  collegeName: string | null;
  userType: string;
  eventType: string;
  guestType: "Approved" | "Waitlist" | "Declined";
  eventName: string | null;
  userId: number;
  eventId: number;
  createdAt: string;
  updatedAt: string;
  referralCode: string;

  // Feedback
  feedbackData: any | null;
  feedbackSubmittedAt: string | null;

  // Certificate
  certificateGenerated: boolean;
  certificateId: string | null;
  certificateGeneratedAt: string | null;
  certificateName: string | null;
  certificateApproved: boolean;

  // Sync
  leads91Synced: boolean;
  leads91SyncedAt: string | null;

  user: {
    email: string;
    profile_picture?: string;
  };

  additionalData?: {
    utm_id?: string;
    visitorId?: string;
    utm_medium?: string;
    utm_source?: string;
    utm_content?: string;
    utm_campaign?: string;
    [key: string]: string | undefined;
  };
}

const GuestLists = () => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [guests, setGuests] = useState<IGuest[]>([]);
  const pathname = usePathname();

  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = Cookies.get("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  useEffect(() => {
    if (pathname) {
      const parts = pathname.split("/");
      const id = parts[parts.length - 2];
      setId(id);
      fetchGuests(id);
    }
  }, [pathname]);

  const fetchGuests = async (id: any) => {
    try {
      setIsLoading(true);
      const requestBody = { eventId: id };
      const response = await getAllGuests(requestBody);
      if (response.result === "SUCCESS") {
        setGuests(response.registrations || []);
      }
      setIsLoading(false);
    } catch (error) {
      console.error("Error fetching guests:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadAsExcel = () => {
    if (!guests || guests.length === 0) return;

    const formattedData = guests.map((guest) => {
      const additional = guest.additionalData || {};

      const baseData: any = {
        ID: guest.id,
        Name: guest.name,
        Phone: guest.phone,
        Email: guest.user?.email || "",
        "User Type": guest.userType,
      };

      if (guest.userType?.toLowerCase() === "student") {
        baseData["Graduation Year"] = guest.graduationYear || "N/A";
        baseData["College Name"] = guest.collegeName || "N/A";
        baseData["Role"] = "";
      } else {
        baseData["Role"] = guest.role || "N/A";
        baseData["Graduation Year"] = "";
        baseData["College Name"] = "";
      }

      return {
        ...baseData,
        LinkedIn: guest.linkedin || "",
        "Referral Code": guest.referralCode || "",
        "Event Type": guest.eventType,
        "Event ID": guest.eventId,
        "Guest Type": guest.guestType,
        "User ID": guest.userId,
        "Feedback Submitted At": guest.feedbackSubmittedAt || "",
        "Certificate Generated": guest.certificateGenerated,
        "Certificate ID": guest.certificateId || "",
        "Certificate Generated At": guest.certificateGeneratedAt || "",
        "Certificate Name": guest.certificateName || "",
        "Certificate Approved": guest.certificateApproved,
        // "Leads91 Synced": guest.leads91Synced,
        // "Leads91 Synced At": guest.leads91SyncedAt || "",
        "Created At": new Date(guest.createdAt).toLocaleString(),
        "Updated At": new Date(guest.updatedAt).toLocaleString(),
        ...Object.fromEntries(
          Object.entries(additional).map(([key, val]) => [key, val ?? ""]),
        ),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedData);

    // Bold headers
    const headers = Object.keys(formattedData[0]);
    headers.forEach((_, index) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: index });
      if (worksheet[cellRef]) {
        worksheet[cellRef].s = {
          font: { bold: true },
        };
      }
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Guests");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
      cellStyles: true,
    });

    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(blob, "guest_list.xlsx");
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "Approved":
        return "default";
      case "Waitlist":
        return "secondary";
      case "Declined":
        return "destructive";
      default:
        return "outline";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="px-5 h-16 flex justify-between items-center border-b">
        <div className="flex items-center gap-2">
          <ArrowLeft
            className="h-5 w-5 m-2 cursor-pointer"
            onClick={() =>
              router.push(`/${user?.role}/events/manage-events/${id}`)
            }
          />
          <p className="text-lg font-semibold">Guest Lists</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground">
            Total Guests: {guests.length}
          </div>

          <Button
            onClick={downloadAsExcel}
            className="cursor-pointer flex items-center gap-2 bg-[#335DC8] hover:bg-[#335DC8] text-white"
          >
            <Download className="w-4 h-4" />
            Download
          </Button>
        </div>
      </div>

      {isLoading ? (
        <HoverLoading
          title={"Please wait while we are fetching the guests..."}
        />
      ) : (
        <div className="flex flex-col h-full flex-1 bg-gray-50 overflow-auto p-5">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guest</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>User Type</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guests.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No guests found for this event.
                    </TableCell>
                  </TableRow>
                ) : (
                  guests.map((guest) => (
                    <TableRow key={guest.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage
                              src={
                                guest.user.profile_picture || "/placeholder.svg"
                              }
                              alt={guest.name}
                            />
                            <AvatarFallback className="text-xs">
                              {getInitials(guest.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{guest.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {guest.user.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          {guest.phone && (
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="h-3 w-3" />
                              <span>{guest.phone}</span>
                            </div>
                          )}
                          {guest.linkedin && (
                            <div className="flex items-center gap-2 text-sm">
                              <Linkedin className="h-3 w-3" />
                              <a
                                href={guest.linkedin}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                LinkedIn
                              </a>
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {guest.userType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(guest.createdAt)}
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={getStatusBadgeVariant(guest.guestType)}
                          className={`${
                            guest.guestType === "Approved"
                              ? "bg-green-100 text-green-800"
                              : guest.guestType === "Waitlist"
                                ? "bg-yellow-100 text-yellow-800"
                                : guest.guestType === "Declined"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-100 text-gray-800"
                          } px-2 py-1 rounded`}
                        >
                          {guest.guestType}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {guests.length > 0 && (
            <div className="mt-4 flex justify-between items-center text-sm text-muted-foreground">
              <div>
                Showing {guests.length} guest{guests.length !== 1 ? "s" : ""}
              </div>
              <div className="flex gap-4">
                <span>
                  Approved:{" "}
                  {guests.filter((g) => g.guestType === "Approved").length}
                </span>
                <span>
                  Waitlist:{" "}
                  {guests.filter((g) => g.guestType === "Waitlist").length}
                </span>
                <span>
                  Declined:{" "}
                  {guests.filter((g) => g.guestType === "Declined").length}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GuestLists;
