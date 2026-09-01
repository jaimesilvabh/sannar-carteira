import type { NextFunction, Request, Response } from "express";
import { verifyToken, type TokenPayload } from "../auth/jwt";
import type { Role } from "../lib/constants";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: "Não autenticado" });
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Sessão inválida ou expirada" });
  }
}

/** Restringe a rota a determinados papéis (ex.: só DIRECAO). */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Sem permissão para esta ação" });
    }
    next();
  };
}
