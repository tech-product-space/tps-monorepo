import https from "https";

import axios from "axios";

import env from "../../config/env.js";
import { META_INVALID_TOKEN_ERROR_CODE } from "../../config/constants/metaLead.js";

/**
 * The only place that talks to Facebook.
 *
 * Keep-alive matters more than it looks: the poll makes one request per active
 * form every five minutes, and without a pooled agent each one pays a fresh TLS
 * handshake to the same host.
 */
const agent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 60_000,
});

const client = axios.create({
  httpsAgent: agent,
  // Long enough for a slow page of 100 leads, short enough that a hung request
  // cannot hold a poll cycle open until the next one starts.
  timeout: 15_000,
});

export const graphBaseUrl = () =>
  `https://graph.facebook.com/${env.meta.graphVersion}`;

/**
 * Graph's error shape, flattened.
 *
 * Facebook puts the useful sentence at `response.data.error.message` and the
 * machine-readable part at `.code`. Surfacing their message verbatim is
 * deliberate: "(#190) This method must be called with a Page Access Token" tells
 * an admin exactly what they pasted wrong, and any paraphrase we write would be
 * worse.
 */
export const parseGraphError = (error) => {
  const graphError = error?.response?.data?.error;

  return {
    message: graphError?.message || error?.message || "Unknown Graph error",
    code: graphError?.code ?? null,
    subcode: graphError?.error_subcode ?? null,
    type: graphError?.type || null,
  };
};

/** Whether an error means the token is dead rather than the request being bad. */
export const isInvalidTokenError = (error) =>
  parseGraphError(error).code === META_INVALID_TOKEN_ERROR_CODE;

/**
 * `GET` against Graph. `url` may be a path fragment or a full URL — Facebook's
 * `paging.next` is an absolute URL that already carries fields, limit and
 * cursor, and the backfill follows it verbatim rather than rebuilding it.
 */
export const graphGet = async (url, params) => {
  const absolute = url.startsWith("http") ? url : `${graphBaseUrl()}${url}`;

  const response = await client.get(
    absolute,
    params ? { params } : undefined,
  );

  return response.data;
};

export default { graphGet, graphBaseUrl, parseGraphError, isInvalidTokenError };
