import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { assertNucleoAccess, scopedNucleoIds } from "../middleware/scopeNucleo";
import { ah, HttpError, required } from "../lib/httpError";
import { registrarAuditoria } from "../services/audit";
import { calcularPontuacoesClientes } from "../services/scoring";

export const clientesRouter = Router();
clientesRouter.use(requireAuth);

clientesRouter.get(
  "/",
  ah(async (req, res) => {
    const nucleoId = req.query.nucleoId as string | undefined;
    if (nucleoId) assertNucleoAccess(req, nucleoId);
    const permitidos = scopedNucleoIds(req);
    const filtroAtivo = req.query.ativo === "todos" ? undefined : req.query.ativo === "false" ? false : true;
    const busca = (req.query.q as string | undefined)?.trim();

    const vinculos = await prisma.clienteNucleo.findMany({
      where: {
        ...(nucleoId ? { nucleoId } : permitidos ? { nucleoId: { in: permitidos } } : {}),
        cliente: {
          ativo: filtroAtivo,
          nome: busca ? { contains: busca } : undefined,
        },
      },
      include: { cliente: true },
      distinct: ["clienteId"],
    });

    const clienteIds = vinculos.map((v) => v.clienteId);
    const pontuacoes = nucleoId ? await calcularPontuacoesClientes(clienteIds, nucleoId) : null;
    const tiposPorCliente = await buscarTiposPorCliente(clienteIds, nucleoId);

    res.json(
      vinculos.map((v) => ({
        ...v.cliente,
        tipos: tiposPorCliente.get(v.clienteId) ?? [],
        pontuacao: pontuacoes?.get(v.clienteId) ?? null,
      }))
    );
  })
);

clientesRouter.get(
  "/:id",
  ah(async (req, res) => {
    const cliente = await prisma.cliente.findUnique({
      where: { id: req.params.id },
      include: { nucleos: { include: { nucleo: true } } },
    });
    if (!cliente) throw new HttpError(404, "Cliente não encontrado");
    const permitidos = scopedNucleoIds(req);
    if (permitidos && !cliente.nucleos.some((n) => permitidos.includes(n.nucleoId))) {
      throw new HttpError(403, "Você não tem acesso a este cliente");
    }

    const pontuacoesPorNucleo: Record<string, unknown> = {};
    const tiposPorNucleo: Record<string, { id: string; nome: string }[]> = {};
    for (const vinculo of cliente.nucleos) {
      if (permitidos && !permitidos.includes(vinculo.nucleoId)) continue;
      pontuacoesPorNucleo[vinculo.nucleoId] = await calcularPontuacoesClientes([cliente.id], vinculo.nucleoId).then((m) => m.get(cliente.id));
      const tipos = await prisma.clienteTipo.findMany({
        where: { clienteId: cliente.id, nucleoId: vinculo.nucleoId },
        include: { tipoCliente: true },
      });
      tiposPorNucleo[vinculo.nucleoId] = tipos.map((t) => ({ id: t.tipoCliente.id, nome: t.tipoCliente.nome }));
    }

    res.json({ ...cliente, pontuacoesPorNucleo, tiposPorNucleo });
  })
);

clientesRouter.post(
  "/",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const nome = required(req.body.nome, "nome");
    const nucleoIds: string[] = required(req.body.nucleoIds, "nucleoIds");
    for (const n of nucleoIds) assertNucleoAccess(req, n);

    const tipoIds: string[] = req.body.tipoIds ?? [];

    const cliente = await prisma.cliente.create({
      data: {
        nome,
        contato: req.body.contato ?? null,
        nivelOriginalTexto: req.body.nivelOriginalTexto ?? null,
        nucleos: { create: nucleoIds.map((nucleoId) => ({ nucleoId })) },
        tipos: tipoIds.length > 0 ? { create: tipoIds.map((tipoClienteId) => ({ nucleoId: nucleoIds[0], tipoClienteId })) } : undefined,
      },
    });
    await registrarAuditoria({ userId: req.user!.userId, acao: "CRIAR", entidade: "Cliente", entidadeId: cliente.id, detalhe: req.body });
    res.status(201).json(cliente);
  })
);

clientesRouter.put(
  "/:id",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const existente = await prisma.cliente.findUnique({ where: { id: req.params.id }, include: { nucleos: true } });
    if (!existente) throw new HttpError(404, "Cliente não encontrado");
    const permitidos = scopedNucleoIds(req);
    if (permitidos && !existente.nucleos.some((n) => permitidos.includes(n.nucleoId))) {
      throw new HttpError(403, "Você não tem acesso a este cliente");
    }

    const atualizado = await prisma.cliente.update({
      where: { id: existente.id },
      data: {
        nome: req.body.nome ?? undefined,
        contato: req.body.contato ?? undefined,
        nivelOriginalTexto: req.body.nivelOriginalTexto ?? undefined,
      },
    });
    await registrarAuditoria({ userId: req.user!.userId, acao: "ATUALIZAR", entidade: "Cliente", entidadeId: atualizado.id, detalhe: req.body });
    res.json(atualizado);
  })
);

/** Substitui o conjunto de tipos do cliente dentro de um núcleo específico (um cliente pode ter tipos diferentes por núcleo). */
clientesRouter.post(
  "/:id/tipos",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const clienteId = req.params.id;
    const nucleoId = required(req.body.nucleoId, "nucleoId");
    assertNucleoAccess(req, nucleoId);
    const tipoIds: string[] = req.body.tipoIds ?? [];

    await prisma.clienteTipo.deleteMany({ where: { clienteId, nucleoId } });
    if (tipoIds.length > 0) {
      await prisma.clienteTipo.createMany({
        data: tipoIds.map((tipoClienteId) => ({ clienteId, nucleoId, tipoClienteId })),
      });
    }
    await registrarAuditoria({ userId: req.user!.userId, acao: "ATUALIZAR_TIPOS", entidade: "Cliente", entidadeId: clienteId, detalhe: { nucleoId, tipoIds } });
    res.json({ ok: true });
  })
);

clientesRouter.post(
  "/:id/pontuacoes",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const clienteId = req.params.id;
    const nucleoId = required(req.body.nucleoId, "nucleoId");
    assertNucleoAccess(req, nucleoId);
    const criterioId = required(req.body.criterioId, "criterioId");
    const valor = Number(required(req.body.valor, "valor"));
    if (valor < 1 || valor > 5) throw new HttpError(400, "valor deve estar entre 1 e 5");

    const registro = await prisma.pontuacaoCriterioCliente.create({
      data: { clienteId, nucleoId, criterioId, valor, mesReferencia: req.body.mesReferencia ?? null },
    });
    await registrarAuditoria({ userId: req.user!.userId, acao: "AVALIAR", entidade: "PontuacaoCriterioCliente", entidadeId: registro.id, detalhe: req.body });
    res.status(201).json(registro);
  })
);

clientesRouter.delete(
  "/:id",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const existente = await prisma.cliente.findUnique({ where: { id: req.params.id }, include: { nucleos: true } });
    if (!existente) throw new HttpError(404, "Cliente não encontrado");
    const permitidos = scopedNucleoIds(req);
    if (permitidos && !existente.nucleos.some((n) => permitidos.includes(n.nucleoId))) {
      throw new HttpError(403, "Você não tem acesso a este cliente");
    }
    await prisma.cliente.update({ where: { id: existente.id }, data: { ativo: false, deletedAt: new Date() } });
    await registrarAuditoria({ userId: req.user!.userId, acao: "EXCLUIR", entidade: "Cliente", entidadeId: existente.id });
    res.json({ ok: true });
  })
);

clientesRouter.delete(
  "/:id/definitivo",
  requireRole("DIRECAO"),
  ah(async (req, res) => {
    const id = req.params.id;
    await prisma.pontuacaoCriterioCliente.deleteMany({ where: { clienteId: id } });
    await prisma.volumeMensalCliente.deleteMany({ where: { clienteId: id } });
    await prisma.alocacao.deleteMany({ where: { clienteId: id } });
    await prisma.clienteNucleo.deleteMany({ where: { clienteId: id } });
    await prisma.cliente.delete({ where: { id } });
    await registrarAuditoria({ userId: req.user!.userId, acao: "EXCLUIR_DEFINITIVO", entidade: "Cliente", entidadeId: id });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Ações em lote
// ---------------------------------------------------------------------------

clientesRouter.post(
  "/batch/delete",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const ids: string[] = required(req.body.ids, "ids");
    await validarAcessoClientes(req, ids);
    const r = await prisma.cliente.updateMany({ where: { id: { in: ids } }, data: { ativo: false, deletedAt: new Date() } });
    await registrarAuditoria({ userId: req.user!.userId, acao: "EXCLUIR_LOTE", entidade: "Cliente", detalhe: { ids } });
    res.json({ afetados: r.count });
  })
);

clientesRouter.post(
  "/batch/toggle-active",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const ids: string[] = required(req.body.ids, "ids");
    const ativo = Boolean(req.body.ativo);
    await validarAcessoClientes(req, ids);
    const r = await prisma.cliente.updateMany({ where: { id: { in: ids } }, data: { ativo, deletedAt: ativo ? null : new Date() } });
    await registrarAuditoria({ userId: req.user!.userId, acao: ativo ? "ATIVAR_LOTE" : "DESATIVAR_LOTE", entidade: "Cliente", detalhe: { ids } });
    res.json({ afetados: r.count });
  })
);

clientesRouter.post(
  "/batch/reassign",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const ids: string[] = required(req.body.ids, "ids");
    const colaboradorId = required(req.body.colaboradorId, "colaboradorId");
    const nucleoId = required(req.body.nucleoId, "nucleoId");
    assertNucleoAccess(req, nucleoId);
    await validarAcessoClientes(req, ids);

    let afetados = 0;
    for (const clienteId of ids) {
      const ativa = await prisma.alocacao.findFirst({ where: { clienteId, nucleoId, dataFim: null } });
      if (ativa) {
        if (ativa.colaboradorId === colaboradorId) continue;
        await prisma.alocacao.update({ where: { id: ativa.id }, data: { dataFim: new Date() } });
      }
      await prisma.alocacao.create({ data: { clienteId, colaboradorId, nucleoId, origem: "MANUAL", dataInicio: new Date() } });
      afetados++;
    }
    await registrarAuditoria({ userId: req.user!.userId, acao: "REATRIBUIR_LOTE", entidade: "Alocacao", detalhe: { ids, colaboradorId, nucleoId } });
    res.json({ afetados });
  })
);

clientesRouter.post(
  "/batch/pontuacao",
  requireRole("DIRECAO", "LIDER_NUCLEO"),
  ah(async (req, res) => {
    const ids: string[] = required(req.body.ids, "ids");
    const nucleoId = required(req.body.nucleoId, "nucleoId");
    assertNucleoAccess(req, nucleoId);
    const criterioId = required(req.body.criterioId, "criterioId");
    const valor = Number(required(req.body.valor, "valor"));
    if (valor < 1 || valor > 5) throw new HttpError(400, "valor deve estar entre 1 e 5");
    await validarAcessoClientes(req, ids);

    await prisma.pontuacaoCriterioCliente.createMany({
      data: ids.map((clienteId) => ({ clienteId, nucleoId, criterioId, valor, mesReferencia: req.body.mesReferencia ?? null })),
    });
    await registrarAuditoria({ userId: req.user!.userId, acao: "AVALIAR_LOTE", entidade: "PontuacaoCriterioCliente", detalhe: { ids, nucleoId, criterioId, valor } });
    res.json({ afetados: ids.length });
  })
);

async function validarAcessoClientes(req: import("express").Request, ids: string[]) {
  const permitidos = scopedNucleoIds(req);
  if (!permitidos) return;
  const vinculos = await prisma.clienteNucleo.findMany({ where: { clienteId: { in: ids } } });
  const foraDeEscopo = vinculos.some((v) => !permitidos.includes(v.nucleoId));
  if (foraDeEscopo) throw new HttpError(403, "Um ou mais clientes não pertencem ao seu núcleo");
}

async function buscarTiposPorCliente(clienteIds: string[], nucleoId?: string): Promise<Map<string, { id: string; nome: string }[]>> {
  const mapa = new Map<string, { id: string; nome: string }[]>();
  if (clienteIds.length === 0) return mapa;
  const vinculos = await prisma.clienteTipo.findMany({
    where: { clienteId: { in: clienteIds }, nucleoId },
    include: { tipoCliente: true },
  });
  for (const v of vinculos) {
    const atual = mapa.get(v.clienteId) ?? [];
    atual.push({ id: v.tipoCliente.id, nome: v.tipoCliente.nome });
    mapa.set(v.clienteId, atual);
  }
  return mapa;
}
