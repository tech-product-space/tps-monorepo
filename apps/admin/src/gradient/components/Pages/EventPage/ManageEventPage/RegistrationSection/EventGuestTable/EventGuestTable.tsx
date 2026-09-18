import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Check, Eye } from "lucide-react";
import { Badge } from "@/gradient/components/ui/badge";
import { Loader2, X } from "lucide-react";
import { EventRegistration } from "@/gradient/types/event";
import { toast } from "sonner";
import { eventService } from "@/gradient/services/eventService";


interface EventGuestTableProps {
  registrations: EventRegistration[];
  regLoading: boolean;
  fetchRegistrations: () => void;
}

export default function EventGuestTable({
  registrations,
  regLoading,
  fetchRegistrations,
}: EventGuestTableProps) {
  const [selectedRegistration, setSelectedRegistration] =
    useState<EventRegistration | null>(null);

  const [updatingGuestId, setUpdatingGuestId] = useState<string | null>(null);

  const handleUpdateGuestStatus = async (guestId: string, status: string) => {
    setUpdatingGuestId(guestId);
    const toastId = toast.loading(`Updating status to ${status}...`);
    try {
      await eventService.updateGuestStatus(guestId, status);
      toast.success(`Status updated to ${status} successfully`, {
        id: toastId,
      });
      fetchRegistrations();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to update status", {
        id: toastId,
      });
    } finally {
      setUpdatingGuestId(null);
    }
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>College / Company</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {regLoading ? (
            <TableRow>
              <TableCell colSpan={6} className="h-32 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading registrations...
                </div>
              </TableCell>
            </TableRow>
          ) : registrations.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="h-32 text-center text-muted-foreground"
              >
                No registrations found for this event.
              </TableCell>
            </TableRow>
          ) : (
            registrations.map((reg) => (
              <TableRow key={reg.id}>
                <TableCell className="font-medium">{reg.name}</TableCell>
                <TableCell>
                  <div className="text-sm">{reg.phone}</div>
                  {reg.linkedinUrl && (
                    <a
                      href={reg.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-500 hover:underline"
                    >
                      LinkedIn
                    </a>
                  )}

                  <p>{reg.email || reg.user.email}</p>
                </TableCell>
                <TableCell>
                  {reg.isAccountLinked ? (
                    <Badge variant="default" className="bg-emerald-100 text-emerald-700 border-0">
                      Linked
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-muted-foreground">
                      Guest
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{reg.attendeeType}</Badge>
                </TableCell>
                <TableCell>
                  {reg.attendeeType === "Student" ? (
                    <>
                      <div className="text-sm">{reg.collegeName || "-"}</div>
                      <div className="text-xs text-muted-foreground">
                        {reg.graduationYear
                          ? `Class of ${reg.graduationYear}`
                          : ""}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm">{reg.role || "-"}</div>
                      <div className="text-xs text-muted-foreground">
                        Professional
                      </div>
                    </>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {new Date(reg.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {updatingGuestId === reg.id ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground w-36">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-xs">Updating...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 min-w-[120px]">
                      <Badge
                        variant={
                          reg.status === "Waitlisted"
                            ? "secondary"
                            : reg.status === "Approved"
                              ? "default"
                              : "outline"
                        }
                        className="whitespace-nowrap"
                      >
                        {reg.status}
                      </Badge>
                      {reg.status !== "Approved" && (
                        <button
                          onClick={() =>
                            handleUpdateGuestStatus(reg.id, "Approved")
                          }
                          className="flex-shrink-0 text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 p-1.5 rounded-md transition-colors"
                          title="Approve"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {reg.status !== "Declined" && (
                        <button
                          onClick={() =>
                            handleUpdateGuestStatus(reg.id, "Declined")
                          }
                          className="flex-shrink-0 text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-md transition-colors"
                          title="Decline"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => setSelectedRegistration(reg)}
                    className="p-1.5 hover:bg-muted rounded-md"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog
        open={!!selectedRegistration}
        onOpenChange={() => setSelectedRegistration(null)}
      >
        <DialogContent className="max-w-3xl! w-full! max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Guest Details</DialogTitle>
          </DialogHeader>

          {selectedRegistration && (
            <div className="space-y-6 text-sm">

              {/* BASIC INFO */}
              <Section title="Basic Information">
                <Detail label="Name" value={selectedRegistration.name} />
                <Detail label="Email" value={selectedRegistration.email} />
                <Detail label="Phone" value={selectedRegistration.phone} />
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Account</span>
                  <span className={`font-medium ${selectedRegistration.isAccountLinked ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {selectedRegistration.isAccountLinked ? "Linked" : "Guest only"}
                  </span>
                </div>
                <Detail label="Type" value={selectedRegistration.attendeeType} />
                <Detail label="Status" value={selectedRegistration.status} />
                <Detail
                  label="Registered"
                  value={new Date(selectedRegistration.createdAt).toLocaleString()}
                />
              </Section>

              {/* EDUCATION / PROFESSIONAL */}
              <Section title="Profile">
                <Detail label="College" value={selectedRegistration.collegeName ?? "-"} />
                <Detail
                  label="Graduation Year"
                  value={selectedRegistration.graduationYear?.toString()}
                />
                <Detail label="Role" value={selectedRegistration.role ?? "-"} />
              </Section>

              {/* REFERRAL */}
              <Section title="Referral">
                <Detail label="Referral Code" value={selectedRegistration.referralCode ?? "-"} />
                <Detail label="Referrer User" value={selectedRegistration.referrerUserId ?? "-"} />
              </Section>

              {/* ADDITIONAL DATA (UTM etc) */}
              {selectedRegistration.additionalData &&
                Object.keys(selectedRegistration.additionalData).length > 0 && (
                  <Section title="Tracking Data">
                    {Object.entries(selectedRegistration.additionalData).map(
                      ([key, value]) => (
                        <Detail
                          key={key}
                          label={formatLabel(key)}
                          value={String(value)}
                        />
                      )
                    )}
                  </Section>
                )}

            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h4 className="text-sm font-semibold text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right break-all">
        {value || "-"}
      </span>
    </div>
  );
}

function formatLabel(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase());
}