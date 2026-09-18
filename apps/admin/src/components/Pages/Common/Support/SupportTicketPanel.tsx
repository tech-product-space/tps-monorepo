"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Download, Headset, Inbox, Info, Lock, Paperclip, Phone, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import LoadingSpinner from "@/components/Common/Loading/HoverLoading";
import { useNotification } from "@/helpers/NotificationContext";
import {
  getTicket,
  updateTicket,
  requestPhone,
  addStaffMessage,
  resolveAttachmentUrl,
  initials,
  avatarColor,
  dayKey,
  formatDateSeparator,
  SupportTicket,
  SupportMessage,
  SupportAttachment,
  SupportStatus,
  SupportPriority,
  STATUS_OPTIONS,
  STATUS_LABEL,
  PRIORITY_OPTIONS,
  PRIORITY_LABEL,
} from "@/services/support/support";

const POLL_MS = 5000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per attachment

function fmtTime(d: string) {
  return new Date(d).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isEvent(m: SupportMessage) {
  return (
    m.sender_type === "system" ||
    m.type === "status_change" ||
    m.type === "assignment" ||
    m.type === "system"
  );
}

function isImage(fileType?: string | null, fileName?: string | null) {
  if (fileType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileName || "");
}

// Turns URLs inside a plain-text message body into clickable links. Matches
// http(s) links, www.* links, and bare domains with a known TLD (e.g.
// theproductspace.in/profile), keeping trailing sentence punctuation out of the
// href. The lookbehind on the bare-domain branch avoids linking the domain half
// of email addresses and dotted words mid-token.
const TLD =
  "com|net|org|io|in|co|ai|dev|app|edu|gov|info|biz|me|us|uk|xyz|tech|online|store|site|live|news";
const URL_REGEX = new RegExp(
  `(https?:\\/\\/[^\\s<]+|www\\.[^\\s<]+|(?<![@\\w.])[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${TLD})(?:\\/[^\\s<]*)?)`,
  "gi"
);

function Linkify({ text, linkClassName = "" }: { text: string; linkClassName?: string }) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));

    const trailing = raw.match(/[.,!?:;)\]]+$/)?.[0] ?? "";
    const url = trailing ? raw.slice(0, raw.length - trailing.length) : raw;
    const href = url.startsWith("http") ? url : `https://${url}`;

    nodes.push(
      <a
        key={start}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`underline underline-offset-2 break-all hover:opacity-80 ${linkClassName}`}
      >
        {url}
      </a>
    );
    if (trailing) nodes.push(trailing);
    lastIndex = start + raw.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return <>{nodes}</>;
}

function AttachmentList({ attachments }: { attachments?: SupportAttachment[] }) {
  if (!attachments || !attachments.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {attachments.map((a) => {
        const url = resolveAttachmentUrl(a.file_url);
        return isImage(a.file_type, a.file_name) ? (
          <div key={a.id} className="border rounded-lg overflow-hidden w-40 bg-white">
            <a href={url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={a.file_name || "attachment"}
                className="w-40 h-28 object-cover hover:opacity-90"
              />
            </a>
            <a
              href={url}
              download={a.file_name || true}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1 text-xs text-blue-600 py-1.5 border-t hover:bg-blue-50"
            >
              <Download className="h-3 w-3" /> Download
            </a>
          </div>
        ) : (
          <div
            key={a.id}
            className="flex items-center gap-2 border rounded-lg px-3 py-2 text-xs bg-white text-gray-700"
          >
            <Paperclip className="h-4 w-4 text-gray-500 shrink-0" />
            <span className="max-w-[160px] truncate">{a.file_name || "attachment"}</span>
            <a
              href={url}
              download={a.file_name || true}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
            >
              <Download className="h-3 w-3" /> Download
            </a>
          </div>
        );
      })}
    </div>
  );
}

function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 my-1">
      <span className="h-px flex-1 bg-gray-200" />
      <span className="text-[11px] text-muted-foreground bg-gray-200/70 rounded-full px-3 py-0.5">
        {formatDateSeparator(date)}
      </span>
      <span className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

// Round avatar: requester gets tinted initials, staff gets a branded headset.
function MsgAvatar({ name, staff }: { name?: string | null; staff?: boolean }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
        staff ? "bg-blue-600 text-white" : avatarColor(name)
      }`}
      title={name || undefined}
    >
      {staff ? <Headset className="h-4 w-4" /> : initials(name)}
    </span>
  );
}

function TicketDetails({ ticket }: { ticket: SupportTicket }) {
  return (
    <>
      <div>
        <h3 className="font-semibold mb-2 text-sm">{ticket.subject}</h3>
        <dl className="text-sm space-y-2">
          <div>
            <dt className="text-muted-foreground text-xs">Name</dt>
            <dd>{ticket.requester_name || ticket.requester?.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Email</dt>
            <dd className="break-all">
              {ticket.requester_email || ticket.requester?.email}
            </dd>
          </div>
          {ticket.requester_phone && (
            <div>
              <dt className="text-muted-foreground text-xs">Phone</dt>
              <dd>{ticket.requester_phone}</dd>
            </div>
          )}
          {ticket.category && (
            <div>
              <dt className="text-muted-foreground text-xs">Category</dt>
              <dd>{ticket.category}</dd>
            </div>
          )}
          {ticket.cohortMember && (
            <div>
              <dt className="text-muted-foreground text-xs">Cohort</dt>
              <dd>
                {ticket.cohortMember.course} — {ticket.cohortMember.cohort} (
                {ticket.cohortMember.status})
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="border-t pt-4">
        <h3 className="font-semibold mb-2 text-sm">Timeline</h3>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Raised: {fmtTime(ticket.createdAt)}</p>
          {ticket.first_response_at && (
            <p>First response: {fmtTime(ticket.first_response_at)}</p>
          )}
          {ticket.closed_at && <p>Closed: {fmtTime(ticket.closed_at)}</p>}
        </div>
      </div>
    </>
  );
}

export const SupportTicketPanel = ({
  ticketId,
  reloadToken = 0,
  onChanged,
  onBack,
}: {
  ticketId: string | null;
  reloadToken?: number;
  onChanged?: (updated?: SupportTicket) => void;
  onBack?: () => void;
}) => {
  const { showNotification } = useNotification();

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [showDetails, setShowDetails] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Default the details drawer to closed on small screens (it opens as a
  // slide-over there); desktop keeps it open inline.
  useEffect(() => {
    if (window.innerWidth < 1024) setShowDetails(false);
  }, []);

  const load = async (silent = false) => {
    if (!ticketId) {
      setTicket(null);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const res = await getTicket(ticketId);
      setTicket(res.data);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    setBody("");
    setIsInternal(false);
    setFiles([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  useEffect(() => {
    if (reloadToken) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  // Short-poll so incoming user replies appear without a manual refresh.
  // Skip while the tab is hidden, and refresh immediately when it becomes visible again.
  useEffect(() => {
    if (!ticketId) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [ticket?.messages?.length, ticketId]);

  // Closed tickets can't receive a public reply — fall back to internal notes.
  useEffect(() => {
    if (ticket?.status === "closed") setIsInternal(true);
  }, [ticket?.status]);

  const patch = async (
    payload: Parameters<typeof updateTicket>[1],
    msg: string
  ) => {
    if (!ticketId) return;
    try {
      const res = await updateTicket(ticketId, payload);
      showNotification("success", "Updated", msg);
      setTicket(res.data);
      onChanged?.(res.data);
    } catch (error: any) {
      showNotification(
        "error",
        "Update failed",
        error?.response?.data?.message || "Could not update ticket"
      );
    }
  };

  const askForPhone = async () => {
    if (!ticketId) return;
    try {
      const res = await requestPhone(ticketId);
      showNotification(
        "success",
        "Phone requested",
        "Asked the user to share their phone number."
      );
      setTicket(res.data);
      onChanged?.(res.data);
    } catch (error: any) {
      showNotification(
        "error",
        "Request failed",
        error?.response?.data?.message || "Could not request phone number"
      );
    }
  };

  const submit = async () => {
    if (!ticketId || (!body.trim() && files.length === 0)) return;

    const tempId = `temp-${Date.now()}`;
    const bodyToSend = body.trim();
    const filesToSend = files;
    const wasInternal = isInternal;
    const optimisticMsg: SupportMessage = {
      id: tempId,
      ticket_id: ticketId,
      sender_type: "staff",
      sender_user_id: null,
      sender_staff_id: null,
      body: bodyToSend || null,
      type: "message",
      is_internal: wasInternal,
      createdAt: new Date().toISOString(),
      attachments: [],
    };

    setTicket((t) => (t ? { ...t, messages: [...(t.messages || []), optimisticMsg] } : t));
    setPendingIds((s) => new Set(s).add(tempId));
    setBody("");
    setFiles([]);
    if (fileRef.current) fileRef.current.value = "";
    setSaving(true);
    try {
      const res = await addStaffMessage(ticketId, bodyToSend, wasInternal, filesToSend);
      setTicket(res.data);
      onChanged?.(res.data);
    } catch (error: any) {
      setTicket((t) =>
        t ? { ...t, messages: (t.messages || []).filter((msg) => msg.id !== tempId) } : t
      );
      setBody(bodyToSend);
      setFiles(filesToSend);
      showNotification(
        "error",
        "Failed",
        error?.response?.data?.message || "Could not send message"
      );
    } finally {
      setPendingIds((s) => {
        const next = new Set(s);
        next.delete(tempId);
        return next;
      });
      setSaving(false);
    }
  };

  const addFiles = (incoming: File[]) => {
    const tooBig = incoming.filter((f) => f.size > MAX_FILE_SIZE);
    const ok = incoming.filter((f) => f.size <= MAX_FILE_SIZE);
    if (tooBig.length) {
      showNotification(
        "error",
        "File too large",
        `${tooBig.map((f) => f.name).join(", ")} exceeds the 10MB limit`
      );
    }
    if (ok.length) setFiles((arr) => [...arr, ...ok]);
  };

  const onComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;

    if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      submit();
      return;
    }

    // Shift/Ctrl/Cmd+Enter inserts a newline. Some browsers don't do this by
    // default for Ctrl/Cmd+Enter in a textarea, so insert it manually.
    e.preventDefault();
    const target = e.currentTarget;
    const { selectionStart, selectionEnd, value } = target;
    const newValue = value.slice(0, selectionStart) + "\n" + value.slice(selectionEnd);
    setBody(newValue);
    requestAnimationFrame(() => {
      target.selectionStart = target.selectionEnd = selectionStart + 1;
    });
  };

  if (!ticketId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <Inbox className="h-10 w-10 mb-2 opacity-40" />
        <p className="text-sm">Select a query to view the conversation</p>
      </div>
    );
  }

  if (loading || !ticket) {
    return (
      <div className="h-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // "Seen" receipt: shown under the last public staff reply once the user has
  // opened the ticket after that reply was sent.
  const lastPublicStaffMsg = [...(ticket.messages || [])]
    .reverse()
    .find((m) => m.sender_type === "staff" && !m.is_internal);
  const seenByUser =
    !!lastPublicStaffMsg &&
    !!ticket.last_user_seen_at &&
    new Date(ticket.last_user_seen_at) >= new Date(lastPublicStaffMsg.createdAt);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header with triage controls */}
      <div className="px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2 border-b bg-white shrink-0 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="lg:hidden flex h-8 w-8 shrink-0 items-center justify-center rounded-md border hover:bg-gray-50"
              aria-label="Back to queue"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <span className="font-semibold">{ticket.ticket_number}</span>
          {ticket.is_cohort_member && (
            <Badge className="bg-emerald-600 text-white">Cohort</Badge>
          )}
          <span className="text-sm text-muted-foreground truncate hidden sm:inline">
            {ticket.requester_name || ticket.requester?.name}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={ticket.status}
            onValueChange={(v) => patch({ status: v as SupportStatus }, "Status updated")}
          >
            <SelectTrigger className="h-8 w-[120px] sm:w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={ticket.priority}
            onValueChange={(v) =>
              patch({ priority: v as SupportPriority }, "Priority updated")
            }
          >
            <SelectTrigger className="h-8 w-[100px] sm:w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={showDetails ? "secondary" : "outline"}
            size="sm"
            className="h-8"
            onClick={() => setShowDetails((s) => !s)}
          >
            <Info className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Conversation */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-5 pb-8 space-y-4">
            {/* Opening query (subject + description + original attachments) */}
            <div className="flex justify-start gap-2.5">
              <MsgAvatar name={ticket.requester_name || ticket.requester?.name} />
              <div className="max-w-[85%] sm:max-w-[75%] bg-white border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <div className="text-xs text-muted-foreground mb-1">
                  {ticket.requester_name || ticket.requester?.name} •{" "}
                  {fmtTime(ticket.createdAt)}
                </div>
                <div className="font-semibold text-sm">{ticket.subject}</div>
                {ticket.category && (
                  <Badge className="bg-slate-100 text-slate-600 my-1">
                    {ticket.category}
                  </Badge>
                )}
                <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">
                  <Linkify text={ticket.description} linkClassName="text-blue-600" />
                </p>
                <AttachmentList
                  attachments={(ticket.attachments || []).filter((a) => !a.message_id)}
                />
              </div>
            </div>

            {(() => {
              let lastDay = dayKey(ticket.createdAt);
              return (ticket.messages || []).map((m) => {
                const showSeparator = dayKey(m.createdAt) !== lastDay;
                if (showSeparator) lastDay = dayKey(m.createdAt);
                const separator = showSeparator ? <DateSeparator date={m.createdAt} /> : null;

                if (isEvent(m)) {
                  return (
                    <div key={m.id}>
                      {separator}
                      <div className="flex justify-center">
                        <span className="text-[11px] text-muted-foreground bg-gray-200/70 rounded-full px-3 py-1">
                          {m.staffAuthor?.name ? `${m.staffAuthor.name}: ` : ""}
                          {m.body || m.type.replace(/_/g, " ")} • {fmtTime(m.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                }

                // Incoming message from the requester.
                if (m.sender_type === "user") {
                  return (
                    <div key={m.id}>
                      {separator}
                      <div className="flex justify-start gap-2.5">
                        <MsgAvatar
                          name={ticket.requester_name || ticket.requester?.name}
                        />
                        <div className="max-w-[85%] sm:max-w-[75%] bg-white border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                          <div className="text-xs text-muted-foreground mb-1">
                            {ticket.requester_name || ticket.requester?.name} •{" "}
                            {fmtTime(m.createdAt)}
                          </div>
                          {m.metadata?.category && (
                            <Badge className="bg-slate-100 text-slate-600 mb-1">
                              {m.metadata.category}
                            </Badge>
                          )}
                          {m.body && (
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">
                              <Linkify text={m.body} linkClassName="text-blue-600" />
                            </p>
                          )}
                          <AttachmentList attachments={m.attachments} />
                        </div>
                      </div>
                    </div>
                  );
                }

                // Outgoing staff message — public reply or internal note.
                const isPending = pendingIds.has(m.id);
                return (
                  <div key={m.id}>
                    {separator}
                    <div className="flex justify-end gap-2.5">
                      <div
                        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm ${
                          isPending ? "opacity-60" : ""
                        } ${
                          m.is_internal
                            ? "bg-amber-100 text-amber-900 border border-amber-300"
                            : "bg-blue-600 text-white"
                        }`}
                      >
                        <div
                          className={`text-[11px] mb-0.5 flex items-center gap-1 ${
                            m.is_internal ? "text-amber-700" : "text-blue-100"
                          }`}
                        >
                          {m.is_internal && <Lock className="h-3 w-3" />}
                          {m.staffAuthor?.name || "Staff"}
                          {m.is_internal && " • Internal note"}
                          {" • "}
                          {isPending ? "Sending…" : fmtTime(m.createdAt)}
                        </div>
                        {m.body && (
                          <p className="text-sm whitespace-pre-wrap">
                            <Linkify
                              text={m.body}
                              linkClassName={m.is_internal ? "text-blue-700" : "text-blue-100"}
                            />
                          </p>
                        )}
                        <AttachmentList attachments={m.attachments} />
                      </div>
                      <MsgAvatar staff name={m.staffAuthor?.name || "Staff"} />
                    </div>
                    {!isPending && lastPublicStaffMsg?.id === m.id && seenByUser && (
                      <div className="flex justify-end mt-0.5">
                        <span className="text-[11px] text-muted-foreground">Seen</span>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>

          {/* Composer */}
          <div className="border-t bg-white px-3 sm:px-4 py-3 shrink-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {ticket.status !== "closed" && (
                <button
                  onClick={() => setIsInternal(false)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    !isInternal
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Public reply
                </button>
              )}
              <button
                onClick={() => setIsInternal(true)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  isInternal
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Internal note
              </button>
              {(ticket.status === "open" || ticket.status === "in_progress") && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs rounded-full"
                  onClick={() => patch({ status: "closed" }, "Ticket closed")}
                >
                  Close session
                </Button>
              )}
              {!ticket.requester_phone && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs rounded-full gap-1"
                  onClick={askForPhone}
                >
                  <Phone className="h-3 w-3" />
                  Ask for phone
                </Button>
              )}
              <span className="text-[11px] text-muted-foreground ml-auto basis-full sm:basis-auto text-right sm:text-left">
                {isInternal
                  ? "Only staff can see this."
                  : "Sent to the user + emailed."}
              </span>
            </div>

            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {files.map((f, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 bg-gray-100 border rounded px-2 py-1 text-xs"
                  >
                    <Paperclip className="h-3 w-3 text-gray-500" />
                    <span className="max-w-[140px] truncate">{f.name}</span>
                    <button
                      onClick={() => setFiles((arr) => arr.filter((_, idx) => idx !== i))}
                      className="text-gray-400 hover:text-gray-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => fileRef.current?.click()}
                title="Attach files"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files || []));
                  if (fileRef.current) fileRef.current.value = "";
                }}
              />
              <Textarea
                placeholder={
                  isInternal
                    ? "Add an internal note…  (Enter to send, Ctrl/⌘+Enter for new line)"
                    : "Reply to the user…  (Enter to send, Ctrl/⌘+Enter for new line)"
                }
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={onComposerKey}
                rows={1}
                className="flex-1 resize-none max-h-32 min-h-[40px]"
              />
              <Button
                onClick={submit}
                disabled={saving || (!body.trim() && files.length === 0)}
                className="h-10"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Details drawer: inline on desktop, slide-over overlay on mobile */}
        {showDetails && (
          <>
            <div
              className="lg:hidden fixed inset-0 z-40 flex justify-end bg-black/40"
              onClick={() => setShowDetails(false)}
            >
              <div
                className="w-72 max-w-[85vw] h-full bg-white overflow-y-auto p-4 space-y-5"
                onClick={(e) => e.stopPropagation()}
              >
                <TicketDetails ticket={ticket} />
              </div>
            </div>
            <div className="hidden lg:block w-72 border-l bg-white overflow-y-auto shrink-0 p-4 space-y-5">
              <TicketDetails ticket={ticket} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
