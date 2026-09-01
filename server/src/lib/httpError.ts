import type { NextFunction, Request, RequestHandler, Response } from "express";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Envolve um handler async para propagar erros ao middleware de erro do Express. */
export function ah(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function required<T>(value: T | undefined | null, campo: string): T {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    throw new HttpError(400, `Campo obrigatório: ${campo}`);
  }
  return value;
}
