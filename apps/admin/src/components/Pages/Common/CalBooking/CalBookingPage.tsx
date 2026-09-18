"use client";

import React, { useEffect, useState } from "react";
import { Eye, Copy } from "lucide-react";

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

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { cn } from "@/lib/utils";
import { getCalBookings } from "@/services/booking/calService";
import { ICalBooking, CalBookingStatus } from "@/types/cal-booking";
import { IPaginationMeta } from "@/types/pagination";
import Pagination from "@/components/ui/custom/Pagination";

const statusColor = (status: CalBookingStatus) => {
    switch (status) {
        case "booked":
            return "bg-green-100 text-green-700";
        case "cancelled":
            return "bg-red-100 text-red-700";
        case "rescheduled":
            return "bg-yellow-100 text-yellow-700";
    }
};

export default function CalBookingPage() {
    const [bookings, setBookings] = useState<ICalBooking[]>([]);
    const [selectedBooking, setSelectedBooking] = useState<ICalBooking | null>(
        null
    );

    const [filter, setFilter] = useState<
        "all" | "upcoming" | "cancelled" | "rescheduled" | "expired"
    >("upcoming");

    const [copiedField, setCopiedField] = useState<string | null>(null);

    // pagination state
    const [meta, setMeta] = useState<IPaginationMeta>({
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
    });

    const fetchBookings = async (page: number, limit: number) => {
        try {
            const response = await getCalBookings(page, limit, filter);

            setBookings(response.data);
            setMeta(response.meta);
        } catch (error) {
            console.error("Failed to fetch bookings", error);
        }
    };

    useEffect(() => {
        fetchBookings(1, meta.limit);
    }, [filter]);

    // pagination handlers
    const handlePageChange = (newPage: number) => {
        setMeta((prev) => ({
            ...prev,
            page: newPage,
        }));
        fetchBookings(newPage, meta.limit);
    };

    const handleLimitChange = (newLimit: number) => {
        setMeta((prev) => ({
            ...prev,
            page: 1,
            limit: newLimit,
        }));
        fetchBookings(1, newLimit);
    };


    const copyToClipboard = (value: string, key: string) => {
        navigator.clipboard.writeText(value);
        setCopiedField(key);

        setTimeout(() => {
            setCopiedField(null);
        }, 1500);
    };

    const now = new Date();

    return (
        <div className="p-6 space-y-6 h-full overflow-y-auto">

            <h1 className="text-2xl font-semibold">Cal Bookings</h1>

            {/* FILTERS */}

            <Tabs
                value={filter}
                onValueChange={(v) => setFilter(v as any)}
            >
                <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                    <TabsTrigger value="expired">Expired</TabsTrigger>
                    <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
                    <TabsTrigger value="rescheduled">Rescheduled</TabsTrigger>
                </TabsList>
            </Tabs>

            {/* BOOKINGS TABLE */}

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">View</TableHead>
                    </TableRow>
                </TableHeader>

                <TableBody>
                    {bookings.map((booking) => {
                        const date = new Date(booking.startTime);

                        const formattedDate = date.toLocaleDateString("en-US", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                        });

                        const formattedTime = date.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                        });

                        const isExpired = new Date(booking.endTime) < now;

                        return (
                            <TableRow key={booking.id}>

                                {/* USER */}

                                <TableCell>
                                    <div className="flex flex-col gap-1">

                                        <span className="font-medium">
                                            {booking.attendeeName}
                                        </span>

                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            {booking.attendeeEmail}

                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-6 w-6"
                                                onClick={() =>
                                                    copyToClipboard(
                                                        booking.attendeeEmail,
                                                        booking.id + "email"
                                                    )
                                                }
                                            >
                                                {copiedField === booking.id + "email"
                                                    ? "✓"
                                                    : <Copy size={14} />}
                                            </Button>
                                        </div>

                                        {booking.attendeePhone && (
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">

                                                {booking.attendeePhone}

                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-6 w-6"
                                                    onClick={() =>
                                                        copyToClipboard(
                                                            booking.attendeePhone,
                                                            booking.id + "phone"
                                                        )
                                                    }
                                                >
                                                    {copiedField === booking.id + "phone"
                                                        ? "✓"
                                                        : <Copy size={14} />}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </TableCell>

                                {/* EVENT */}

                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-medium">
                                            {booking.eventTitle}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {booking.eventType}
                                        </span>
                                    </div>
                                </TableCell>

                                {/* DATE */}

                                <TableCell>
                                    <div className="flex flex-col gap-1">

                                        <span className="font-medium">
                                            {formattedDate}
                                        </span>

                                        <span className="text-sm text-muted-foreground">
                                            {formattedTime}
                                        </span>

                                        {booking.meetingUrl && (
                                            <a
                                                href={booking.meetingUrl}
                                                target="_blank"
                                                className="text-blue-600 text-sm underline"
                                            >
                                                Join meeting
                                            </a>
                                        )}
                                    </div>
                                </TableCell>


                                {/* STATUS */}

                                <TableCell>
                                    <Badge
                                        className={cn(
                                            isExpired && booking.status === "booked"
                                                ? "bg-gray-100 text-gray-700"
                                                : statusColor(booking.status),
                                            "uppercase"
                                        )}
                                    >
                                        {isExpired && booking.status === "booked"
                                            ? "expired"
                                            : booking.status}
                                    </Badge>
                                </TableCell>

                                {/* VIEW */}

                                <TableCell className="text-right">
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setSelectedBooking(booking)}
                                    >
                                        <Eye size={16} />
                                    </Button>
                                </TableCell>

                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>

            {/* PAGINATION */}

            <div className="p-4">
                <Pagination
                    meta={meta}
                    onPageChange={handlePageChange}
                    onLimitChange={handleLimitChange}
                />
            </div>

            {/* BOOKING DETAILS DIALOG */}

            <Dialog
                open={!!selectedBooking}
                onOpenChange={() => setSelectedBooking(null)}
            >
                <DialogContent className="max-w-lg">

                    <DialogHeader>
                        <DialogTitle>Booking Details</DialogTitle>
                    </DialogHeader>

                    {selectedBooking && (
                        <div className="space-y-6">

                            <div className="grid grid-cols-2 gap-y-4 text-sm">

                                <span className="text-muted-foreground">Name</span>
                                <span>{selectedBooking.attendeeName}</span>

                                <span className="text-muted-foreground">Email</span>
                                <span>{selectedBooking.attendeeEmail}</span>

                                <span className="text-muted-foreground">Phone</span>
                                <span>{selectedBooking.attendeePhone || "-"}</span>

                                <span className="text-muted-foreground">Event</span>
                                <span>{selectedBooking.eventTitle}</span>

                                <span className="text-muted-foreground">Start</span>
                                <span>{new Date(selectedBooking.startTime).toLocaleString()}</span>

                                <span className="text-muted-foreground">End</span>
                                <span>{new Date(selectedBooking.endTime).toLocaleString()}</span>

                                <span className="text-muted-foreground">Status</span>

                                <Badge className={statusColor(selectedBooking.status)}>
                                    {selectedBooking.status}
                                </Badge>

                                <span className="text-muted-foreground">Notes</span>
                                <span>{selectedBooking.attendeeNotes || "-"}</span>

                                <span className="text-muted-foreground">
                                    Cancel Reason
                                </span>
                                <span>
                                    {selectedBooking.cancellationReason || "-"}
                                </span>

                                <span className="text-muted-foreground">
                                    Reschedule Reason
                                </span>
                                <span>
                                    {selectedBooking.rescheduleReason || "-"}
                                </span>

                            </div>

                            {selectedBooking.meetingUrl && (
                                <div className="border-t pt-4">

                                    <Button asChild className="w-full">
                                        <a
                                            href={selectedBooking.meetingUrl}
                                            target="_blank"
                                        >
                                            Join Meeting
                                        </a>
                                    </Button>

                                </div>
                            )}

                        </div>
                    )}
                </DialogContent>
            </Dialog>

        </div>
    );
}