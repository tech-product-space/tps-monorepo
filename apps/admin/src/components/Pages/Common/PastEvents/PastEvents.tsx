"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Users, Clock, Eye, Edit, Copy } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import {
  deleteEvents,
  getAllEvents,
  getPastEvents,
  updateEventPublishStatus,
} from "@/services/Events/eventServices";
import Image from "next/image";
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
import { useNotification } from "@/helpers/NotificationContext";
import DuplicateEventDialog from "../EventCommonComponents/DuplicateEventDialog";

export const slugify = (title: string) => {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
};

export interface IEvent {
  id: number;
  eventTitle: string;
  eventSubtitle: string;
  eventStartDate: string;
  eventEndDate: string;
  eventStartTime: string;
  eventEndTime: string;
  eventType: "Teardown" | "Hackathon" | "Workshop";
  eventSlug: string;
  ctaType: "Join Waitlist" | "Register Now";
  speakers: {
    name: string;
    designation: string;
    company: string;
  }[];
  tags: string[];
  isPublished: any;
  numberOfAttendees: number;
  eventCreativeUrl: string;
  canAcceptResponse: boolean;
  locationType?: string;
  location?: string;
  eventCategory?: string;
}

export default function PastEvents() {
  const [selectedEvent, setSelectedEvent] = useState<IEvent | null>(null);
  const [events, setEvents] = useState<IEvent[]>([]);
  const router = useRouter();

  const handleEventClick = (event: IEvent) => {
    setSelectedEvent(event);
  };

  const getAllEventsFn = async () => {
    try {
      const response = await getPastEvents();
      console.log("Fetched events:", response);
      setEvents(response.events);
    } catch (error) {
      console.error("Error fetching events:", error);
    }
  };

  const handlePageRefesh = () => {
    getAllEventsFn();
  };

  useEffect(() => {
    getAllEventsFn();
  }, []);

  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="px-5 h-16 flex justify-between items-center border-b border-gray-200">
        <p className="text-lg font-semibold text-gray-900">Events</p>
      </div>

      <div className="flex-1 overflow-auto p-5 pb-10 bg-gray-50">
        <EventsTable
          events={events}
          onEventClick={handleEventClick}
          pageRefresh={handlePageRefesh}
        />
        {/* {viewMode === "timeline" ? (
          <Timeline data={timelineData} />
        ) : (
          <EventsTable events={events} onEventClick={handleEventClick} />
        )} */}
      </div>

      {/* Event Details Drawer */}
      <Sheet open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <SheetContent className="w-[400px] sm:w-[540px] bg-white border-gray-200">
          {selectedEvent && (
            <>
              <SheetHeader>
                <SheetTitle className="text-gray-900 text-left">
                  {selectedEvent.eventTitle}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                {/* Event Image */}
                <div className="w-full h-48 bg-linear-to-br  rounded-lg flex items-center justify-center">
                  <Image
                    src={selectedEvent.eventCreativeUrl}
                    alt="thumbnail"
                    height={500}
                    width={500}
                    className=" rounded-xl max-h-[220px]"
                  />
                </div>

                {/* Event Details */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-gray-600">
                    <Clock className="w-5 h-5" />
                    <span>{selectedEvent.eventStartDate}</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-600">
                    <MapPin className="w-5 h-5" />
                    <span>{selectedEvent.locationType}</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-600">
                    <Users className="w-5 h-5" />
                    <span>
                      {selectedEvent.numberOfAttendees} guests registered
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-600">
                    <Calendar className="w-5 h-5" />
                    <span>{selectedEvent.eventStartDate}</span>
                  </div>
                </div>

                {/* Event Type and Tags */}
                <div className="space-y-3">
                  <div>
                    <Badge
                      variant="outline"
                      className="bg-blue-50 text-blue-700 border-blue-200"
                    >
                      {selectedEvent.eventType}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedEvent.tags.map((tag, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="bg-gray-100 text-gray-900"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Attendees */}
                {selectedEvent.numberOfAttendees > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Attendees
                    </h3>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <Button
                    disabled={true}
                    className="flex-1  bg-blue-600 hover:bg-blue-700"
                  >
                    {selectedEvent.ctaType}
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      router.push(
                        `past-events/manage-events/${selectedEvent.id}`,
                      );
                    }}
                    variant="outline"
                    className="flex-1 cursor-pointer border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Manage Event
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
function EventsTable({
  events,
  onEventClick,
  pageRefresh,
}: {
  events: IEvent[];
  onEventClick: (event: IEvent) => void;
  pageRefresh: () => void;
}) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventPublish, setEventPublish] = useState(false);
  const [selectedEventStatus, setSelectedEventStatus] = useState<
    boolean | null
  >(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [eventToDuplicate, setEventToDuplicate] = useState<IEvent | null>(null);
  const { showNotification } = useNotification();

  const deleteEventFn = async (id: string) => {
    try {
      const response = await deleteEvents(id);
      console.log("Event deleted successfully:", response);
      if (response.result === "SUCCESS") {
        showNotification("success", "Event Deleted Successfully", "");
        setDeleteDialogOpen(false);
        pageRefresh(); // re-fetch or re-render
      }
    } catch (error) {
      console.error("Error deleting event:", error);
    }
  };

  const publishEventFn = async (eventId: string, isPublish: boolean) => {
    try {
      await updateEventPublishStatus(eventId, isPublish);
      pageRefresh();
      setEventPublish(false);
    } catch (error) {
      console.error("Update failed:", error);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Event</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Date & Time</TableHead>
            <TableHead>Accept Response</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow
              key={event.id}
              className="hover:bg-gray-50"
              onClick={() => onEventClick(event)}
            >
              <TableCell>
                <div>
                  <div className="font-medium text-gray-900">
                    {event.eventTitle}
                  </div>
                  {event.eventSubtitle && (
                    <div className="text-sm text-gray-500">
                      {event.eventSubtitle?.split(" ").slice(0, 5).join(" ") +
                        (event.eventSubtitle?.split(" ").length > 5
                          ? "..."
                          : "")}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className="bg-blue-50 text-blue-700 border-blue-200"
                >
                  {event.eventType}
                </Badge>
              </TableCell>

              <TableCell>
                <Badge
                  variant="outline"
                  className="bg-blue-50 text-blue-700 border-blue-200"
                >
                  {event.eventCategory}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  <div>{event.eventStartDate}</div>
                  {event.eventStartTime != "null" && (
                    <div className="text-gray-500">{event.eventStartTime}</div>
                  )}
                </div>
              </TableCell>

              <TableCell>
                <div className="flex justify-center">
                  {event.canAcceptResponse ? (
                    <Badge className="bg-green-100 text-green-800 border-green-200">
                      Accepting
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="bg-gray-100 text-gray-600 border-gray-200"
                    >
                      Closed
                    </Badge>
                  )}
                </div>
              </TableCell>

              <TableCell>
                <div
                  className="flex items-center gap-2 text-sm cursor-pointer"
                  // onClick={handleClick}
                >
                  {event?.isPublished ? (
                    <>
                      <p className="px-2 py-1 rounded-lg text-center w-20 bg-green-100 text-green-800 text-md">
                        Published
                      </p>
                      <Pencil
                        size={16}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setSelectedEventId(event.id.toString());
                          setSelectedEventStatus(event.isPublished);
                          setEventPublish(true);
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <p className="px-2 py-1 rounded-lg text-center w-20 bg-orange-100 text-orange-800 text-md">
                        Draft
                      </p>
                      <Pencil
                        size={16}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setSelectedEventId(event.id.toString());
                          setSelectedEventStatus(event.isPublished);
                          setEventPublish(true);
                        }}
                      />
                    </>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      router.push(`past-events/manage-events/${event.id}`);
                    }}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      router.push(`past-events/edit/${event.id}`);
                    }}
                    size="sm"
                    className="h-8 w-8 p-0 cursor-pointer"
                    aria-label="Edit Event"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setEventToDuplicate(event);
                      setDuplicateDialogOpen(true);
                    }}
                    aria-label="Duplicate Event"
                    title="Duplicate Event"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  {/* <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setSelectedEventId(event.id.toString());
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button> */}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              Event post.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedEventId) deleteEventFn(selectedEventId);
              }}
              className="bg-destructive text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={eventPublish} onOpenChange={setEventPublish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will {selectedEventStatus ? "unpublish" : "publish"} the
              event.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedEventId !== null) {
                  publishEventFn(selectedEventId, !selectedEventStatus); // pass true or false
                }
              }}
              className={`text-white ${
                selectedEventStatus
                  ? "bg-orange-600 hover:bg-orange-700"
                  : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {selectedEventStatus ? "Draft" : "Publish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DuplicateEventDialog
        event={eventToDuplicate}
        open={duplicateDialogOpen}
        onOpenChange={setDuplicateDialogOpen}
        onDuplicated={pageRefresh}
        successDescription="The copy is dated in the future, so you'll find it under Events."
      />
    </div>
  );
}
