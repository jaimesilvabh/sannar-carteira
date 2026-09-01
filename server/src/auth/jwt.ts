import jwt from "jsonwebtoken";
import type { Role } from "../lib/constants";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export interface TokenPayload {
  userId: string;
  role: Role;
  nucleoId: string | null;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}
