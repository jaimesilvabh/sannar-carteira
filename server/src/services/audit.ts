import { prisma } from "../lib/prisma";

export async function registrarAuditoria(params: {
  userId?: string | null;
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  detalhe?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.userId ?? null,
      acao: params.acao,
      entidade: params.entidade,
      entidadeId: params.entidadeId ?? null,
      detalhe: params.detalhe !== undefined ? JSON.stringify(params.detalhe) : null,
    },
  });
}
