import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { assertNucleoAccess } from "../middleware/scopeNucleo";
import { ah, HttpError } from "../lib/httpError";
import { calcularPontuacoesClientes } from "../services/scoring";
import { NIVEIS_CLIENTE } from "../lib/constants";
import { novoDocumento, cabecalho, tituloSecao, kpiLinha, tabela } from "../services/pdfHelpers";

export const relatoriosRouter = Router();
relatoriosRouter.use(requireAuth);

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// ---------------------------------------------------------------------------
// Coleta de dados (reaproveitada pela tela e pelo PDF)
// ---------------------------------------------------------------------------

async function dadosRelatorioColaborador(colaboradorId: string, ano: number) {
  const colaborador = await prisma.colaborador.findUniqueOrThrow({ where: { id: colaboradorId }, include: { nucleo: true } });
  const alocacoes = await prisma.alocacao.findMany({
    where: { colaboradorId, nucleoId: colaborador.nucleoId, dataFim: null },
    include: { cliente: true },
  });
  const clienteIds = alocacoes.map((a) => a.clienteId);
  const pontuacoes = await calcularPontuacoesClientes(clienteIds, colaborador.nucleoId);

  const tiposVinculos = await prisma.clienteTipo.findMany({
    where: { clienteId: { in: clienteIds }, nucleoId: colaborador.nucleoId },
    include: { tipoCliente: true },
  });
  const tiposPorCliente = new Map<string, string[]>();
  for (const v of tiposVinculos) {
    const atual = tiposPorCliente.get(v.clienteId) ?? [];
    atual.push(v.tipoCliente.nome);
    tiposPorCliente.set(v.clienteId, atual);
  }

  const clientesPorNivel: Record<string, number> = Object.fromEntries(NIVEIS_CLIENTE.map((n) => [n, 0]));
  let pontuacaoTotal = 0;
  let naoAvaliados = 0;
  const carteira = alocacoes
    .map((a) => {
      const p = pontuacoes.get(a.clienteId);
      if (p?.nivel) {
        clientesPorNivel[p.nivel]++;
        pontuacaoTotal += p.pontuacaoTotal;
      } else {
        naoAvaliados++;
      }
      return {
        nome: a.cliente.nome,
        tipos: (tiposPorCliente.get(a.clienteId) ?? []).join(", "),
        nivel: p?.nivel ?? "Não avaliado",
        pontuacao: p?.pontuacaoTotal ?? 0,
      };
    })
    .sort((x, y) => x.nome.localeCompare(y.nome));

  const timesheets = await prisma.timesheetMensal.findMany({ where: { colaboradorId, ano, ativo: true } });
  const produtividadeMensal = Array.from({ length: 12 }, (_, i) => {
    const t = timesheets.find((x) => x.mes === i + 1);
    return { mes: MESES_ABREV[i], eficiencia: t ? t.eficiencia : null };
  });
  const comDado = timesheets.filter((t) => t.eficiencia !== null);
  const produtividadeMedia = comDado.length > 0 ? comDado.reduce((s, t) => s + t.eficiencia, 0) / comDado.length : null;

  return {
    colaborador,
    totalClientes: clienteIds.length,
    naoAvaliados,
    clientesPorNivel,
    pontuacaoTotal,
    custoPorPonto: pontuacaoTotal > 0 ? colaborador.remuneracaoTotal / pontuacaoTotal : null,
    cargaRelativa: colaborador.capacidadeMaximaPontos ? pontuacaoTotal / colaborador.capacidadeMaximaPontos : null,
    carteira,
    produtividadeMensal,
    produtividadeMedia,
    ano,
  };
}

async function dadosRelatorioNucleo(nucleoId: string, ano: number) {
  const nucleo = await prisma.nucleo.findUniqueOrThrow({ where: { id: nucleoId } });
  const colaboradores = await prisma.colaborador.findMany({ where: { nucleoId, ativo: true }, orderBy: { nome: "asc" } });

  const linhas = [];
  let pontuacaoTotalNucleo = 0;
  let clientesTotalNucleo = 0;
  for (const colaborador of colaboradores) {
    const alocacoes = await prisma.alocacao.findMany({ where: { colaboradorId: colaborador.id, nucleoId, dataFim: null } });
    const pontuacoes = await calcularPontuacoesClientes(alocacoes.map((a) => a.clienteId), nucleoId);
    const pontuacaoTotal = [...pontuacoes.values()].reduce((s, p) => s + p.pontuacaoTotal, 0);
    const timesheets = await prisma.timesheetMensal.findMany({ where: { colaboradorId: colaborador.id, ano, ativo: true } });
    const eficienciaMedia = timesheets.length > 0 ? timesheets.reduce((s, t) => s + t.eficiencia, 0) / timesheets.length : null;

    pontuacaoTotalNucleo += pontuacaoTotal;
    clientesTotalNucleo += alocacoes.length;
    linhas.push({
      colaborador: colaborador.nome,
      nivelTecnico: colaborador.nivelTecnico,
      totalClientes: alocacoes.length,
      pontuacaoTotal,
      capacidadeMaximaPontos: colaborador.capacidadeMaximaPontos,
      cargaRelativa: colaborador.capacidadeMaximaPontos ? pontuacaoTotal / colaborador.capacidadeMaximaPontos : null,
      eficienciaMedia,
    });
  }

  return { nucleo, ano, colaboradoresAtivos: colaboradores.length, clientesTotalNucleo, pontuacaoTotalNucleo, linhas };
}

async function dadosRelatorioCustos(nucleoId: string) {
  const nucleo = await prisma.nucleo.findUniqueOrThrow({ where: { id: nucleoId } });
  const colaboradores = await prisma.colaborador.findMany({ where: { nucleoId, ativo: true }, orderBy: { nome: "asc" } });

  const linhas = [];
  for (const colaborador of colaboradores) {
    const alocacoes = await prisma.alocacao.findMany({ where: { colaboradorId: colaborador.id, nucleoId, dataFim: null } });
    const pontuacoes = await calcularPontuacoesClientes(alocacoes.map((a) => a.clienteId), nucleoId);
    const pontuacaoTotal = [...pontuacoes.values()].reduce((s, p) => s + p.pontuacaoTotal, 0);
    linhas.push({
      colaborador: colaborador.nome,
      remuneracaoTotal: colaborador.remuneracaoTotal,
      pontuacaoTotal,
      custoPorPonto: pontuacaoTotal > 0 ? colaborador.remuneracaoTotal / pontuacaoTotal : null,
      totalClientes: alocacoes.length,
    });
  }
  const validos = linhas.filter((l) => l.custoPorPonto !== null);
  const mediaCustoPorPonto = validos.length > 0 ? validos.reduce((s, l) => s + (l.custoPorPonto ?? 0), 0) / validos.length : null;
  const remuneracaoTotalNucleo = linhas.reduce((s, l) => s + l.remuneracaoTotal, 0);

  return { nucleo, linhas, mediaCustoPorPonto, remuneracaoTotalNucleo };
}

async function dadosClientesPorTipo(nucleoId: string) {
  const nucleo = await prisma.nucleo.findUniqueOrThrow({ where: { id: nucleoId } });
  const tipos = await prisma.tipoCliente.findMany({ where: { nucleoId, ativo: true }, orderBy: { nome: "asc" } });

  const grupos = [];
  for (const tipo of tipos) {
    const vinculos = await prisma.clienteTipo.findMany({
      where: { tipoClienteId: tipo.id, cliente: { ativo: true } },
      include: { cliente: true },
      orderBy: { cliente: { nome: "asc" } },
    });
    grupos.push({ tipo: tipo.nome, quantidade: vinculos.length, clientes: vinculos.map((v) => v.cliente.nome) });
  }
  const semTipo = await prisma.clienteNucleo.count({
    where: { nucleoId, cliente: { ativo: true, tipos: { none: { nucleoId } } } },
  });

  return { nucleo, grupos, semTipo };
}

// ---------------------------------------------------------------------------
// Endpoints JSON (para a tela) + PDF (para download)
// ---------------------------------------------------------------------------

relatoriosRouter.get(
  "/colaborador/:id",
  ah(async (req, res) => {
    const colaborador = await prisma.colaborador.findUnique({ where: { id: req.params.id } });
    if (!colaborador) throw new HttpError(404, "Colaborador não encontrado");
    assertNucleoAccess(req, colaborador.nucleoId);
    const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
    res.json(await dadosRelatorioColaborador(req.params.id, ano));
  })
);

relatoriosRouter.get(
  "/colaborador/:id/pdf",
  ah(async (req, res) => {
    const colaborador = await prisma.colaborador.findUnique({ where: { id: req.params.id } });
    if (!colaborador) throw new HttpError(404, "Colaborador não encontrado");
    assertNucleoAccess(req, colaborador.nucleoId);
    const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
    const d = await dadosRelatorioColaborador(req.params.id, ano);

    const doc = novoDocumento(`Relatório - ${d.colaborador.nome}`);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio-${slug(d.colaborador.nome)}.pdf"`);
    doc.pipe(res);

    cabecalho(doc, `Relatório do Colaborador — ${d.colaborador.nome}`, `Núcleo Pessoal · Nível técnico ${d.colaborador.nivelTecnico} · Ano ${ano}`);

    tituloSecao(doc, "Resultados");
    kpiLinha(doc, [
      ["Total de clientes:", String(d.totalClientes)],
      ["Não avaliados:", String(d.naoAvaliados)],
      ["Pontuação da carteira:", d.pontuacaoTotal.toFixed(1)],
      ["Capacidade máxima:", d.colaborador.capacidadeMaximaPontos ? String(d.colaborador.capacidadeMaximaPontos) : "não definida"],
      ["Carga relativa:", d.cargaRelativa !== null ? `${(d.cargaRelativa * 100).toFixed(0)}%` : "—"],
      ["Custo por ponto:", d.custoPorPonto !== null ? formatarMoeda(d.custoPorPonto) : "—"],
      ["Produtividade média no ano:", d.produtividadeMedia !== null ? `${d.produtividadeMedia.toFixed(1)}%` : "sem lançamentos"],
    ]);

    tituloSecao(doc, "Clientes por nível");
    tabela(
      doc,
      [
        { titulo: "Nível", largura: 100, quebraLinha: false },
        { titulo: "Quantidade", largura: 100, quebraLinha: false },
      ],
      NIVEIS_CLIENTE.map((n) => [n, String(d.clientesPorNivel[n])])
    );

    tituloSecao(doc, "Relação analítica da carteira");
    tabela(
      doc,
      [
        { titulo: "Cliente", largura: 220 },
        { titulo: "Tipo", largura: 130 },
        { titulo: "Nível", largura: 70, quebraLinha: false },
        { titulo: "Pontuação", largura: 90, quebraLinha: false },
      ],
      d.carteira.map((c) => [c.nome, c.tipos || "—", c.nivel, c.pontuacao.toFixed(1)])
    );

    tituloSecao(doc, "Produtividade mensal");
    tabela(
      doc,
      [
        { titulo: "Mês", largura: 80, quebraLinha: false },
        { titulo: "Eficiência (%)", largura: 120, quebraLinha: false },
      ],
      d.produtividadeMensal.map((p) => [p.mes, p.eficiencia !== null ? p.eficiencia.toFixed(1) : "—"])
    );

    doc.end();
  })
);

relatoriosRouter.get(
  "/nucleo/:nucleoId/desempenho",
  ah(async (req, res) => {
    assertNucleoAccess(req, req.params.nucleoId);
    const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
    res.json(await dadosRelatorioNucleo(req.params.nucleoId, ano));
  })
);

relatoriosRouter.get(
  "/nucleo/:nucleoId/desempenho/pdf",
  ah(async (req, res) => {
    assertNucleoAccess(req, req.params.nucleoId);
    const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
    const d = await dadosRelatorioNucleo(req.params.nucleoId, ano);

    const doc = novoDocumento(`Desempenho - ${d.nucleo.nome}`);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="desempenho-${slug(d.nucleo.nome)}.pdf"`);
    doc.pipe(res);

    cabecalho(doc, `Desempenho Geral da Carteira — ${d.nucleo.nome}`, `Ano ${ano}`);
    kpiLinha(doc, [
      ["Colaboradores ativos:", String(d.colaboradoresAtivos)],
      ["Clientes atendidos:", String(d.clientesTotalNucleo)],
      ["Pontuação total do núcleo:", d.pontuacaoTotalNucleo.toFixed(1)],
    ]);

    tituloSecao(doc, "Desempenho por colaborador");
    tabela(
      doc,
      [
        { titulo: "Colaborador", largura: 130 },
        { titulo: "Nível", largura: 45, quebraLinha: false },
        { titulo: "Clientes", largura: 60, quebraLinha: false },
        { titulo: "Pontuação", largura: 70, quebraLinha: false },
        { titulo: "Capacidade", largura: 70, quebraLinha: false },
        { titulo: "Carga", largura: 55, quebraLinha: false },
        { titulo: "Eficiência média", largura: 85, quebraLinha: false },
      ],
      d.linhas.map((l) => [
        l.colaborador,
        l.nivelTecnico,
        String(l.totalClientes),
        l.pontuacaoTotal.toFixed(1),
        l.capacidadeMaximaPontos ? String(l.capacidadeMaximaPontos) : "—",
        l.cargaRelativa !== null ? `${(l.cargaRelativa * 100).toFixed(0)}%` : "—",
        l.eficienciaMedia !== null ? `${l.eficienciaMedia.toFixed(1)}%` : "—",
      ])
    );

    doc.end();
  })
);

relatoriosRouter.get(
  "/nucleo/:nucleoId/custos",
  ah(async (req, res) => {
    assertNucleoAccess(req, req.params.nucleoId);
    res.json(await dadosRelatorioCustos(req.params.nucleoId));
  })
);

relatoriosRouter.get(
  "/nucleo/:nucleoId/custos/pdf",
  ah(async (req, res) => {
    assertNucleoAccess(req, req.params.nucleoId);
    const d = await dadosRelatorioCustos(req.params.nucleoId);

    const doc = novoDocumento(`Custos - ${d.nucleo.nome}`);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="custos-${slug(d.nucleo.nome)}.pdf"`);
    doc.pipe(res);

    cabecalho(doc, `Custo Consolidado por Colaborador — ${d.nucleo.nome}`);
    kpiLinha(doc, [
      ["Remuneração total do núcleo:", formatarMoeda(d.remuneracaoTotalNucleo)],
      ["Custo médio por ponto:", d.mediaCustoPorPonto !== null ? formatarMoeda(d.mediaCustoPorPonto) : "—"],
    ]);

    tituloSecao(doc, "Análise por colaborador");
    tabela(
      doc,
      [
        { titulo: "Colaborador", largura: 150 },
        { titulo: "Remuneração total", largura: 110, quebraLinha: false },
        { titulo: "Clientes", largura: 60, quebraLinha: false },
        { titulo: "Pontuação carteira", largura: 100, quebraLinha: false },
        { titulo: "Custo por ponto", largura: 95, quebraLinha: false },
      ],
      d.linhas.map((l) => [
        l.colaborador,
        formatarMoeda(l.remuneracaoTotal),
        String(l.totalClientes),
        l.pontuacaoTotal.toFixed(1),
        l.custoPorPonto !== null ? formatarMoeda(l.custoPorPonto) : "—",
      ])
    );

    doc.end();
  })
);

relatoriosRouter.get(
  "/nucleo/:nucleoId/clientes-por-tipo",
  ah(async (req, res) => {
    assertNucleoAccess(req, req.params.nucleoId);
    res.json(await dadosClientesPorTipo(req.params.nucleoId));
  })
);

relatoriosRouter.get(
  "/nucleo/:nucleoId/clientes-por-tipo/pdf",
  ah(async (req, res) => {
    assertNucleoAccess(req, req.params.nucleoId);
    const d = await dadosClientesPorTipo(req.params.nucleoId);

    const doc = novoDocumento(`Clientes por tipo - ${d.nucleo.nome}`);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="clientes-por-tipo-${slug(d.nucleo.nome)}.pdf"`);
    doc.pipe(res);

    cabecalho(doc, `Clientes por Tipo — ${d.nucleo.nome}`);
    tituloSecao(doc, "Resumo");
    tabela(
      doc,
      [
        { titulo: "Tipo", largura: 200 },
        { titulo: "Quantidade", largura: 100, quebraLinha: false },
      ],
      [...d.grupos.map((g) => [g.tipo, String(g.quantidade)]), ["Sem tipo definido", String(d.semTipo)]]
    );

    for (const g of d.grupos) {
      if (g.quantidade === 0) continue;
      tituloSecao(doc, `${g.tipo} (${g.quantidade})`);
      tabela(
        doc,
        [{ titulo: "Cliente", largura: 400 }],
        g.clientes.map((c) => [c])
      );
    }

    doc.end();
  })
);

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(new RegExp("[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]", "g"), "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
