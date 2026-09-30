import { OAuth2Client } from "google-auth-library";
import env from "../env.js";

export const googleAuthClient = new OAuth2Client(env.google.auth.clientId);