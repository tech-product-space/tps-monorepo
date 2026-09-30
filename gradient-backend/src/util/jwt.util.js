import jwt from "jsonwebtoken";
import env from "../config/env.js";


export const generateToken = (payload, expiry="1d") => {
  return jwt.sign(payload, env.jwt.auth.secret, {
    expiresIn: expiry,
  });
};

export const verifyToken = (token) => {
  return jwt.verify(token, env.jwt.auth.secret);
};