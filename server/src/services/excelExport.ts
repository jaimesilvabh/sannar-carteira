import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma";

const NOMES_MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** Recria o formato original da planilha (uma aba por colaborador + DOMESTICAS) a partir do banco. */
export async function exportarPlanilhaPessoal(nucleoId: string, ano: number): Promise<Buffer> {
  const colaboradores = await prisma.colaborador.findMany({ where: { nucleoId, ativo: true }, orderBy: { nome: "asc" } });
  const wb = XLSX.utils.book_new();

  const todosVinculosTipo = await prisma.clienteTipo.findMany({ where: { nucleoId }, include: { tipoCliente: true } });
  const tiposPorCliente = new Map<string, string[]>();
  for (const v of todosVinculosTipo) {
    const atual = tiposPorCliente.get(v.clienteId) ?? [];
    atual.push(v.tipoCliente.nome);
    tiposPorCliente.set(v.clienteId, atual);
  }
  const ehDomestica = (clienteId: string) => (tiposPorCliente.get(clienteId) ?? []).some((n) => n.toLowerCase().includes("domestic"));

  for (const colaborador of colaboradores) {
    const alocacoes = await prisma.alocacao.findMany({
      where: { colaboradorId: colaborador.id, nucleoId, dataFim: null },
      include: { cliente: true },
    });
    const clientesNaoDomestica = alocacoes.filter((a) => !ehDomestica(a.clienteId));
    if (clientesNaoDomestica.length === 0) continue;

    const header = ["Nº", "Nome do Cliente", "Níveis das empresas", "Tipo", "Responsaveis pelas empresas", "Nome Cliente - Contato"];
    for (let m = 1; m <= 12; m++) {
      const sufixo = `${NOMES_MESES[m - 1]}/${String(ano).slice(-2)}`;
      header.push(`Nº Empregados ${sufixo}`, `Nº Sócios ${sufixo}`, `Nº Autonomo ${sufixo}`, `Nº Estagiario ${sufixo}`);
    }
    const linhas: (string | number | null)[][] = [header];

    let n = 1;
    for (const a of clientesNaoDomestica) {
      const volumes = await prisma.volumeMensalCliente.findMany({ where: { clienteId: a.clienteId, ano } });
      const volMap = new Map(volumes.map((v) => [v.mes, v]));
      const row: (string | number | null)[] = [
        n++,
        a.cliente.nome,
        a.cliente.nivelOriginalTexto ?? "",
        (tiposPorCliente.get(a.clienteId) ?? []).join("/"),
        colaborador.nome,
        a.cliente.contato ?? "",
      ];
      for (let m = 1; m <= 12; m++) {
        const v = volMap.get(m);
        row.push(v?.nEmpregados ?? null, v?.nSocios ?? null, v?.nAutonomos ?? null, v?.nEstagiarios ?? null);
      }
      linhas.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(linhas);
    XLSX.utils.book_append_sheet(wb, ws, colaborador.nome.substring(0, 31));
  }

  const vinculosNucleo = await prisma.clienteNucleo.findMany({ where: { nucleoId }, include: { cliente: true } });
  const domesticos = vinculosNucleo.filter((v) => ehDomestica(v.clienteId));
  if (domesticos.length > 0) {
    const linhas: (string | number | null)[][] = [[], ["Nº", "CLIENTE", "observações"]];
    domesticos.forEach((v, i) => linhas.push([i + 1, v.cliente.nome, v.cliente.observacoesHistorico ?? ""]));
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    XLSX.utils.book_append_sheet(wb, ws, "DOMESTICAS");
  }

  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Sem dados para exportar"]]), "Vazio");
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
