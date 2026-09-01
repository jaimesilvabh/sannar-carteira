import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { scopedNucleoIds } from "../middleware/scopeNucleo";
import { ah, HttpError } from "../lib/httpError";
import { gerarAlertas } from "../services/alerts";

export const decisoesRouter = Router();
decisoesRouter.use(requireAuth);

decisoesRouter.get(
  "/",
  ah(async (req, res) => {
    const nucleoIdQuery = req.query.nucleoId as string | undefined;
    const permitidos = scopedNucleoIds(req);
    if (nucleoIdQuery && permitidos && !permitidos.includes(nucleoIdQuery)) {
      throw new HttpError(403, "Você não tem acesso a este núcleo");
    }

    if (nucleoIdQuery) {
      return res.json(await gerarAlertas(nucleoIdQuery));
    }
    if (!permitidos) {
      return res.json(await gerarAlertas());
    }
    const todos = [];
    for (const nucleoId of permitidos) {
      todos.push(...(await gerarAlertas(nucleoId)));
    }
    res.json(todos);
  })
);
