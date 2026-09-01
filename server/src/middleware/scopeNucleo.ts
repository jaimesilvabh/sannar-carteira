import type { NextFunction, Request, Response } from "express";

/**
 * Regras de escopo por núcleo (seção 12 do prompt):
 * - DIRECAO enxerga tudo, sem filtro.
 * - LIDER_NUCLEO só pode ler/gravar dados do próprio núcleo. Isso é reforçado aqui no
 *   backend (nunca só escondido no front), então qualquer rota que aceite um nucleoId
 *   vindo do cliente (body, query ou param) deve chamar `assertNucleoAccess`.
 */

export class NucleoForbiddenError extends Error {
  status = 403;
  constructor(message = "Você não tem acesso a este núcleo") {
    super(message);
  }
}

/** Retorna a lista de nucleoIds que o usuário pode acessar, ou undefined = sem restrição (DIRECAO). */
export function scopedNucleoIds(req: Request): string[] | undefined {
  if (req.user?.role === "DIRECAO") return undefined;
  if (req.user?.nucleoId) return [req.user.nucleoId];
  return [];
}

/** Lança 403 se um LIDER_NUCLEO tentar acessar/gravar um núcleo que não é o seu. */
export function assertNucleoAccess(req: Request, nucleoId: string | null | undefined) {
  if (req.user?.role === "DIRECAO") return;
  if (!nucleoId || nucleoId !== req.user?.nucleoId) {
    throw new NucleoForbiddenError();
  }
}

/** Middleware para rotas com :nucleoId na URL. */
export function requireNucleoParam(req: Request, res: Response, next: NextFunction) {
  try {
    assertNucleoAccess(req, req.params.nucleoId);
    next();
  } catch (e) {
    if (e instanceof NucleoForbiddenError) return res.status(403).json({ error: e.message });
    next(e);
  }
}
