const psEnv = require("@ps/env/crm");
const { Lead, LeadProfile, Activity, Meeting } = require('../../models');
const { verifyCalSignature } = require("../../utils/veifyCalRequest");
const { extractPhoneDetails } = require("../../utils/helper/phone");
const leadService = require("../../services/lead.service");
const { resolveCalcomAccount } = require("../../config/calcom");
const crypto = require("crypto");

/**
 * Cal.com gives no feedback beyond the HTTP status, so a rejected delivery is
 * otherwise a silent 401 in the access log with nothing to act on. These lines
 * say *which* check failed and what the request actually carried.
 *
 * Dev only — matching the NODE_ENV convention the error middleware already
 * uses. It stays off in production because the mismatch branch prints the
 * expected HMAC digest: harmless for a payload we already hold, but it is a
 * valid signature for that exact body and does not belong in a prod log. The
 * signing secret itself is never printed, only the name of the env var.
 */
const isDev = () => psEnv.NODE_ENV !== "production";

function calLog(...args) {
  if (isDev()) console.log("[cal-webhook]", ...args);
}

/**
 * Mirrors a Cal.com booking onto a Meeting row, alongside the Lead row we
 * already write.
 *
 * Why both: the Lead is the person and their *current* booking state, which is
 * what the Dashboard and CalcomLeadTable read; the Meeting is each *individual*
 * booking event, which is what the Meetings surface reads. Same seam as
 * LeadProfile/Lead. It also means booking history survives — createOrProcessReentry
 * dedupes by phone and shallow-merges extra_fields, so a repeat caller's earlier
 * booking is overwritten on the Lead, but each one keeps its own Meeting row.
 *
 * The point of the row is `outcome`. Cal.com never tells us a call happened — it
 * only ever says Booked / Rescheduled / Cancelled — so without somewhere to
 * record a verdict, a Cal.com call that went ahead and one everybody ignored
 * look identical forever.
 *
 * Keyed on iCalUID, matching the cancel/reschedule handlers below, and unique in
 * the DB so Cal.com's delivery retries update rather than duplicate. `outcome`
 * is deliberately never written here: a retry or a reschedule must not erase a
 * verdict a human already logged.
 */
async function upsertCalcomMeeting({ lead, profile, payload, iCalUID, calcomStatus }) {
  if (!iCalUID || !payload?.startTime || !payload?.endTime) return;

  const cancelled = calcomStatus === "Cancelled";
  const fields = {
    lead_id: lead.id,
    profile_id: lead.profile_id,
    // Null when nobody has picked the lead up yet. The booking cron already
    // routes unassigned bookings to Superadmins.
    organizer_id: lead.agent_id || null,
    source: "calcom",
    calcom_uid: iCalUID,
    calcom_status: calcomStatus,
    google_event_id: null,
    meet_link: payload.metadata?.videoCallUrl || null,
    title: payload.title || "Cal.com booking",
    description: payload.responses?.notes?.value || null,
    start_time: payload.startTime,
    end_time: payload.endTime,
    // A booking the lead cancelled through the link is cancelled, not a
    // no-show — Cal.com genuinely does own that fact, so it needs no verdict.
    status: cancelled ? "cancelled" : "scheduled",
    status_synced: false,
    attendees: profile
      ? [
          {
            email: profile.email || null,
            name: profile.name || null,
            user_id: null,
            type: "lead",
          },
        ]
      : [],
  };

  const existing = await Meeting.findOne({ where: { calcom_uid: iCalUID } });
  if (existing) {
    await existing.update(fields);
    return;
  }
  await Meeting.create(fields);
}

/**
 * The Meeting row is a projection; the Lead row is the record. If projecting
 * fails we lose an outcome card, not a booking — so it must never take the
 * webhook down or make Cal.com retry a delivery we already applied.
 */
async function mirrorBooking(args) {
  try {
    await upsertCalcomMeeting(args);
  } catch (err) {
    console.error(
      `Cal.com meeting mirror failed (iCalUID ${args.iCalUID}):`,
      err.message,
    );
  }
}

exports.webhook = async (req, res) => {
  try {
    // Which brand's Cal.com sent this. Absent on the legacy bare /cal route,
    // which resolves to the default account — see config/calcom.js.
    const account = resolveCalcomAccount(req.params.account);
    if (!account) {
      calLog(
        `404 unknown account "${req.params.account}" — url=${req.originalUrl}`,
      );
      return res.status(404).json({ error: "Unknown Cal.com account" });
    }

    calLog(
      `hit account=${account.key} product=${account.productId} ` +
        `trigger=${req.body?.triggerEvent || "?"} url=${req.originalUrl}`,
    );

    if (!verifyCalSignature(req, account.secret)) {
      // Separate the two causes: an unset secret is a deployment problem, a
      // mismatch is a wrong secret on one side or a body that did not survive
      // the parse/re-stringify round-trip.
      if (!account.secret) {
        calLog(
          `401 ${account.key}: ${account.secretEnv} is not set — this account ` +
            `rejects every delivery until it is`,
        );
      } else {
        const received = req.headers["x-cal-signature-256"];
        const expected = crypto
          .createHmac("sha256", account.secret)
          .update(JSON.stringify(req.body))
          .digest("hex");
        calLog(
          `401 ${account.key} signature mismatch (secret from ${account.secretEnv})\n` +
            `        received: ${received || "(no x-cal-signature-256 header)"}\n` +
            `        expected: ${expected}`,
        );
      }
      return res.status(401).json({ error: "Invalid signature" });
    }

    const { triggerEvent, payload } = req.body;

    const name = payload.attendees?.[0]?.name;
    const email = payload.attendees?.[0]?.email;
    const phone = payload.attendees?.[0]?.phoneNumber;
    const bookingUid = payload.uid;
    const iCalUID = payload.iCalUID;
    const notes = payload.responses?.notes?.value || null;
    const cancellationReason = payload.cancellationReason || null;
    const rescheduleReason = payload.responses?.rescheduleReason?.value || null;
    const meetingUrl = payload.metadata?.videoCallUrl;

    switch (triggerEvent) {
      case "BOOKING_CREATED":
        if (phone) {
          const { countryCode, phoneNumber } = extractPhoneDetails(phone);
          const { lead, profile } = await leadService.createOrProcessReentry({
            product_id: account.productId,
            name,
            email,
            phone: phoneNumber,
            country_code: countryCode,
            extra_fields: {
              status: "Booked",
              eventTitle: payload.title,
              eventType: payload.eventType?.slug,
              startTime: payload.startTime,
              endTime: payload.endTime,
              notes,
              meetingUrl,
            },
            additional_data: {
              bookingUid,
              iCalUID,
              // Which Cal.com instance this came from. Not used for lookup
              // (product_id already scopes that) — it is there so a booking can
              // be traced back to an account when the products are renamed or
              // merged later.
              calcomAccount: account.key,
            }
          }, null, 'Cal.com Webhook');
          calLog(
            `created/updated lead=${lead.id} product=${account.productId} ` +
              `phone=${phoneNumber} iCalUID=${iCalUID}`,
          );
          await mirrorBooking({
            lead,
            profile,
            payload,
            iCalUID,
            calcomStatus: "Booked",
          });
        } else {
          // Not an error and not a retry-worthy failure — but it is the single
          // most common reason a booking exists in Cal.com and nowhere in the
          // CRM: dedup is by phone, so a booking form without a phone question
          // has nothing to key on.
          calLog(
            `BOOKING_CREATED ignored — no attendee phone. Does the ${account.key} ` +
              `event type ask for one? attendee=${email || name || "unknown"}`,
          );
        }
        break;

      case "BOOKING_CANCELLED":
        if (iCalUID) {
          // Scoped to the sending account's product. Two Cal.com instances
          // minting the same iCalUID is vanishingly unlikely, but a cross-brand
          // write would be silent and unrecoverable, so it is ruled out by
          // construction rather than by probability.
          const cancelledLead = await Lead.findOne({
            where: {
              "additional_data.iCalUID": iCalUID,
              product_id: account.productId,
              is_deleted: false,
            },
            include: [{ model: LeadProfile, as: "Profile" }],
          });
          if (cancelledLead) {
            await cancelledLead.update({
              extra_fields: {
                ...cancelledLead.extra_fields,
                status: "Cancelled",
                cancellationReason,
              },
            });
            await Activity.create({
              lead_id: cancelledLead.id,
              profile_id: cancelledLead.profile_id,
              type: 'System',
              title: 'Booking Cancelled',
              details: cancellationReason
                ? `Booking cancelled via Cal.com webhook. Reason: ${cancellationReason}`
                : 'Booking cancelled via Cal.com webhook (no reason provided).',
              metadata: {
                source: 'Cal.com Webhook',
                trigger: 'BOOKING_CANCELLED',
                iCalUID,
                cancellationReason,
                old_status: cancelledLead.extra_fields?.status,
              }
            });
            await mirrorBooking({
              lead: cancelledLead,
              profile: cancelledLead.Profile,
              payload,
              iCalUID,
              calcomStatus: "Cancelled",
            });
            calLog(`cancelled lead=${cancelledLead.id} iCalUID=${iCalUID}`);
          } else {
            // Cancel/reschedule only ever *updates* — it never creates. A miss
            // means the original BOOKING_CREATED never landed on this product
            // (wrong account, or it predates the integration).
            calLog(
              `BOOKING_CANCELLED matched no lead — iCalUID=${iCalUID} ` +
                `product=${account.productId}`,
            );
          }
        }
        break;

      case "BOOKING_RESCHEDULED":
        if (iCalUID) {
          // Same brand scoping as BOOKING_CANCELLED above.
          const rescheduledLead = await Lead.findOne({
            where: {
              "additional_data.iCalUID": iCalUID,
              product_id: account.productId,
              is_deleted: false,
            },
            include: [{ model: LeadProfile, as: "Profile" }],
          });
          if (rescheduledLead) {
            const oldStart = rescheduledLead.extra_fields?.startTime;
            await rescheduledLead.update({
              extra_fields: {
                ...rescheduledLead.extra_fields,
                status: "Rescheduled",
                rescheduleReason,
                startTime: payload.startTime,
                endTime: payload.endTime,
                meetingUrl
              },
            });
            await Activity.create({
              lead_id: rescheduledLead.id,
              profile_id: rescheduledLead.profile_id,
              type: 'System',
              title: 'Booking Rescheduled',
              details: `Rescheduled via Cal.com webhook from ${oldStart || 'unknown'} to ${payload.startTime}.${rescheduleReason ? ` Reason: ${rescheduleReason}` : ''}`,
              metadata: {
                source: 'Cal.com Webhook',
                trigger: 'BOOKING_RESCHEDULED',
                iCalUID,
                rescheduleReason,
                old: { startTime: oldStart, endTime: rescheduledLead.extra_fields?.endTime },
                new: { startTime: payload.startTime, endTime: payload.endTime, meetingUrl },
              }
            });
            // Moving the call does not settle it: the new sitting still needs a
            // verdict, so the outcome stays untouched and the row re-enters the
            // queue once the new end_time passes.
            await mirrorBooking({
              lead: rescheduledLead,
              profile: rescheduledLead.Profile,
              payload,
              iCalUID,
              calcomStatus: "Rescheduled",
            });
            calLog(
              `rescheduled lead=${rescheduledLead.id} iCalUID=${iCalUID} ` +
                `→ ${payload.startTime}`,
            );
          } else {
            calLog(
              `BOOKING_RESCHEDULED matched no lead — iCalUID=${iCalUID} ` +
                `product=${account.productId}`,
            );
          }
        }
        break;

      default:
        // Cal.com lets you subscribe to triggers this handler has no case for.
        // They are answered 200 (nothing to retry) and do nothing, which is
        // indistinguishable from a working delivery without this line.
        calLog(`trigger "${triggerEvent}" has no handler — ignored`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    // Not dev-gated: a 500 here makes Cal.com retry, so it matters in prod too.
    console.error(
      `[cal-webhook] handler failed (account=${req.params.account || "default"}, ` +
        `trigger=${req.body?.triggerEvent || "?"}):`,
      error,
    );
    res.status(500).json({ error: "Something went wrong" });
  }
};
