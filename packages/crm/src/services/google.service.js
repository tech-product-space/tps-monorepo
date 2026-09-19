"use strict";
const psEnv = require("@ps/env/crm");
const crypto = require("crypto");
const { Readable } = require("stream");
const { google } = require("googleapis");
const jwt = require("jsonwebtoken");
const { UserIntegration } = require("../models");
const { encrypt, decrypt } = require("../utils/crypto");

/**
 * Per-user Google OAuth (authorization-code + refresh token) and
 * Calendar v3 event management for the Google Meet integration.
 *
 * Tokens are stored AES-256-GCM encrypted in user_integrations.
 * On invalid_grant (user revoked access) the row is marked 'revoked'
 * and callers receive GoogleReconnectError → API responds 409 so the
 * frontend can show a "Reconnect Google" CTA.
 */

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  // Only files this app creates — used to host meeting attachments in the
  // organizer's Drive so they can be attached to the calendar event.
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

class GoogleNotConnectedError extends Error {
  constructor() {
    super("Google Calendar is not connected");
    this.code = "GOOGLE_NOT_CONNECTED";
  }
}

class GoogleReconnectError extends Error {
  constructor() {
    super("Google Calendar access was revoked — reconnect required");
    this.code = "GOOGLE_RECONNECT_REQUIRED";
  }
}

function newOAuthClient() {
  return new google.auth.OAuth2(
    psEnv.GOOGLE_CLIENT_ID,
    psEnv.GOOGLE_CLIENT_SECRET,
    psEnv.GOOGLE_REDIRECT_URI,
  );
}

function isInvalidGrant(err) {
  const data = err?.response?.data;
  return (
    data?.error === "invalid_grant" ||
    /invalid_grant/i.test(err?.message || "")
  );
}

// Token predates a scope we now need (e.g. drive.file added later) —
// the user has to re-consent, same UX as a revoked token.
function isInsufficientScope(err) {
  const status = err?.response?.status || err?.code;
  return (
    status === 403 &&
    /insufficient|scope/i.test(
      err?.response?.data?.error?.message || err?.message || "",
    )
  );
}

function isGone(err) {
  const status = err?.response?.status || err?.code;
  return status === 404 || status === 410;
}

function buildAuthUrl(userId) {
  const state = jwt.sign(
    { sub: userId, purpose: "gcal_link" },
    psEnv.JWT_SECRET,
    { expiresIn: "10m" },
  );
  return newOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // guarantees a refresh_token on every (re)link
    scope: SCOPES,
    state,
  });
}

async function handleCallback(code, state) {
  let payload;
  try {
    payload = jwt.verify(state, psEnv.JWT_SECRET);
  } catch (err) {
    throw new Error("Invalid or expired state parameter");
  }
  if (payload.purpose !== "gcal_link" || !payload.sub) {
    throw new Error("Invalid state parameter");
  }
  const userId = payload.sub;

  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("Google did not return a refresh token — retry linking");
  }
  client.setCredentials(tokens);

  const { data: userinfo } = await google
    .oauth2({ version: "v2", auth: client })
    .userinfo.get();

  const values = {
    google_email: userinfo.email || null,
    access_token_enc: tokens.access_token ? encrypt(tokens.access_token) : null,
    access_token_expires_at: tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : null,
    refresh_token_enc: encrypt(tokens.refresh_token),
    scope: tokens.scope || SCOPES.join(" "),
    status: "connected",
    last_error: null,
  };

  const existing = await UserIntegration.findOne({
    where: { user_id: userId, provider: "google" },
  });
  if (existing) {
    await existing.update(values);
  } else {
    await UserIntegration.create({
      user_id: userId,
      provider: "google",
      ...values,
    });
  }
  return { email: userinfo.email };
}

async function getIntegration(userId) {
  return UserIntegration.findOne({
    where: { user_id: userId, provider: "google" },
  });
}

async function markRevoked(integration, err) {
  try {
    await integration.update({
      status: "revoked",
      last_error: err?.message || "invalid_grant",
    });
  } catch (updateErr) {
    console.error("[google] failed to mark integration revoked:", updateErr);
  }
}

/**
 * Returns an OAuth2 client with the user's credentials loaded.
 * Rotated tokens (Google refreshes access tokens transparently) are
 * persisted back via the client's 'tokens' event.
 */
async function getAuthedClientForUser(userId) {
  const integration = await getIntegration(userId);
  if (!integration) throw new GoogleNotConnectedError();
  if (integration.status === "revoked") throw new GoogleReconnectError();

  const client = newOAuthClient();
  client.setCredentials({
    access_token: integration.access_token_enc
      ? decrypt(integration.access_token_enc)
      : undefined,
    refresh_token: decrypt(integration.refresh_token_enc),
    expiry_date: integration.access_token_expires_at
      ? new Date(integration.access_token_expires_at).getTime()
      : undefined,
  });

  client.on("tokens", (tokens) => {
    const updates = {};
    if (tokens.access_token) {
      updates.access_token_enc = encrypt(tokens.access_token);
      updates.access_token_expires_at = tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null;
    }
    if (tokens.refresh_token) {
      updates.refresh_token_enc = encrypt(tokens.refresh_token);
    }
    if (Object.keys(updates).length) {
      integration
        .update(updates)
        .catch((err) =>
          console.error("[google] failed to persist rotated tokens:", err),
        );
    }
  });

  return { client, integration };
}

/** Runs a Google API call, translating invalid_grant / missing scopes into GoogleReconnectError. */
async function withGoogle(userId, fn) {
  const { client, integration } = await getAuthedClientForUser(userId);
  try {
    return await fn(client);
  } catch (err) {
    if (isInvalidGrant(err) || isInsufficientScope(err)) {
      await markRevoked(integration, err);
      throw new GoogleReconnectError();
    }
    throw err;
  }
}

async function withCalendar(userId, fn) {
  return withGoogle(userId, (client) =>
    fn(google.calendar({ version: "v3", auth: client })),
  );
}

function extractMeetLink(event) {
  if (event.hangoutLink) return event.hangoutLink;
  const entry = (event.conferenceData?.entryPoints || []).find(
    (e) => e.entryPointType === "video",
  );
  return entry?.uri || null;
}

/**
 * Uploads a file to the organizer's Drive (drive.file scope) and makes it
 * link-viewable so external attendees (the lead) can open it. Returns the
 * shape Calendar expects for event attachments.
 */
async function uploadAttachment(userId, { name, mimeType, buffer }) {
  return withGoogle(userId, async (client) => {
    const drive = google.drive({ version: "v3", auth: client });
    const { data: file } = await drive.files.create({
      requestBody: { name },
      media: { mimeType, body: Readable.from(buffer) },
      fields: "id, webViewLink, name, mimeType",
    });
    await drive.permissions.create({
      fileId: file.id,
      requestBody: { role: "reader", type: "anyone" },
    });
    return {
      drive_file_id: file.id,
      file_url: file.webViewLink,
      title: file.name,
      mime_type: file.mimeType,
    };
  });
}

async function createEvent(
  userId,
  { title, description, startUtc, endUtc, timezone, attendeeEmails, attachments },
) {
  return withCalendar(userId, async (calendar) => {
    const { data: event } = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: 1,
      sendUpdates: "all",
      supportsAttachments: true,
      requestBody: {
        summary: title,
        description: description || undefined,
        start: { dateTime: startUtc, timeZone: timezone },
        end: { dateTime: endUtc, timeZone: timezone },
        attendees: attendeeEmails.map((email) => ({ email })),
        attachments: (attachments || []).map((a) => ({
          fileUrl: a.file_url,
          title: a.title,
          mimeType: a.mime_type,
        })),
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });
    return { eventId: event.id, meetLink: extractMeetLink(event) };
  });
}

/** Patch an event. Returns { gone: true } if it no longer exists on Google. */
async function patchEvent(
  userId,
  eventId,
  { title, description, startUtc, endUtc, timezone, attendeeEmails, attachments },
) {
  return withCalendar(userId, async (calendar) => {
    const requestBody = {};
    if (title !== undefined) requestBody.summary = title;
    if (description !== undefined) requestBody.description = description;
    if (startUtc) requestBody.start = { dateTime: startUtc, timeZone: timezone };
    if (endUtc) requestBody.end = { dateTime: endUtc, timeZone: timezone };
    if (attendeeEmails) {
      requestBody.attendees = attendeeEmails.map((email) => ({ email }));
    }
    if (attachments) {
      requestBody.attachments = attachments.map((a) => ({
        fileUrl: a.file_url,
        title: a.title,
        mimeType: a.mime_type,
      }));
    }
    try {
      const { data: event } = await calendar.events.patch({
        calendarId: "primary",
        eventId,
        sendUpdates: "all",
        supportsAttachments: true,
        requestBody,
      });
      return { gone: false, meetLink: extractMeetLink(event) };
    } catch (err) {
      if (isGone(err)) return { gone: true };
      throw err;
    }
  });
}

/** Deletes a Drive file previously created by uploadAttachment. */
async function deleteAttachment(userId, driveFileId) {
  return withGoogle(userId, async (client) => {
    const drive = google.drive({ version: "v3", auth: client });
    await drive.files.delete({ fileId: driveFileId });
  });
}

/** Delete an event. Returns { gone: true } if it was already gone. */
async function deleteEvent(userId, eventId) {
  return withCalendar(userId, async (calendar) => {
    try {
      await calendar.events.delete({
        calendarId: "primary",
        eventId,
        sendUpdates: "all",
      });
      return { gone: false };
    } catch (err) {
      if (isGone(err)) return { gone: true };
      throw err;
    }
  });
}

/** Best-effort token revoke at Google, then delete the integration row. */
async function disconnect(userId) {
  const integration = await getIntegration(userId);
  if (!integration) return;
  try {
    const client = newOAuthClient();
    await client.revokeToken(decrypt(integration.refresh_token_enc));
  } catch (err) {
    console.warn("[google] token revoke failed (continuing):", err.message);
  }
  await integration.destroy();
}

module.exports = {
  buildAuthUrl,
  handleCallback,
  getIntegration,
  uploadAttachment,
  deleteAttachment,
  createEvent,
  patchEvent,
  deleteEvent,
  disconnect,
  GoogleNotConnectedError,
  GoogleReconnectError,
};
