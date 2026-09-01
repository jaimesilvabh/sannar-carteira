import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma";
import { MESES_PT } from "../lib/constants";

const ABAS_IGNORADAS = ["planilha1", "planilha1 (2)", "planilha1(2)"];
const ABA_DOMESTICAS = "domesticas";

export interface RelatorioImportacao {
  abasProcessadas: string[];
  abasIgnoradas: string[];
  clientesCriados: number;
  clientesAtualizados: number;
  colaboradoresCriados: number;
  volumesGravados: number;
  alocacoesCriadas: number;
  avisos: string[];
}

export async function importarPlanilhaPessoal(buffer: Buffer, nucleoId: string): Promise<RelatorioImportacao> {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const relatorio: RelatorioImportacao = {
    abasProcessadas: [],
    abasIgnoradas: [],
    clientesCriados: 0,
    clientesAtualizados: 0,
    colaboradoresCriados: 0,
    volumesGravados: 0,
    alocacoesCriadas: 0,
    avisos: [],
  };

  const clientesExistentes = await prisma.cliente.findMany();
  const clienteIdPorNome = new Map(clientesExistentes.map((c) => [normalizar(c.nome), c.id]));

  const colaboradoresExistentes = await prisma.colaborador.findMany({ where: { nucleoId } });
  const colaboradorIdPorNome = new Map(colaboradoresExistentes.map((c) => [normalizar(c.nome), c.id]));

  const tiposExistentes = await prisma.tipoCliente.findMany({ where: { nucleoId } });
  const tipoIdPorNome = new Map(tiposExistentes.map((t) => [normalizar(t.nome), t.id]));

  for (const sheetName of workbook.SheetNames) {
    const chaveAba = normalizar(sheetName);
    if (ABAS_IGNORADAS.includes(chaveAba)) {
      relatorio.abasIgnoradas.push(sheetName);
      continue;
    }

    const linhas: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: true,
    });

    if (chaveAba === ABA_DOMESTICAS) {
      await importarAbaDomesticas(linhas, sheetName, nucleoId, clienteIdPorNome, tipoIdPorNome, relatorio);
      relatorio.abasProcessadas.push(sheetName);
      continue;
    }

    await importarAbaColaborador(linhas, sheetName, nucleoId, clienteIdPorNome, colaboradorIdPorNome, tipoIdPorNome, relatorio);
    relatorio.abasProcessadas.push(sheetName);
  }

  return relatorio;
}

// ---------------------------------------------------------------------------
// Aba de colaborador (formato principal: seção 2 do prompt)
// ---------------------------------------------------------------------------

interface ColunaMensal {
  col: number;
  header: string;
  mes: number;
  ano: number;
  categoria: "empregados" | "socios" | "autonomos" | "estagiarios";
}

async function importarAbaColaborador(
  linhas: unknown[][],
  sheetName: string,
  nucleoId: string,
  clienteIdPorNome: Map<string, string>,
  colaboradorIdPorNome: Map<string, string>,
  tipoIdPorNome: Map<string, string>,
  relatorio: RelatorioImportacao
) {
  const headerRowIdx = encontrarLinhaCabecalho(linhas, ["nome do cliente", "cliente"]);
  if (headerRowIdx === -1) {
    relatorio.avisos.push(`Aba "${sheetName}": não foi possível localizar a linha de cabeçalho, aba ignorada.`);
    return;
  }
  const header = linhas[headerRowIdx].map((h) => (h == null ? "" : String(h)));
  const headerNorm = header.map(normalizar);

  const colNome = headerNorm.findIndex((h) => h.includes("nome do cliente"));
  const colNivel = headerNorm.findIndex((h) => h.includes("niveis das empresas") || h.includes("nivel da empresa"));
  const colTipo = headerNorm.findIndex((h) => h === "tipo" || h.startsWith("tipo"));
  const colsResponsaveis = headerNorm
    .map((h, idx) => (h.includes("responsaveis pelas empresas") ? idx : -1))
    .filter((idx) => idx !== -1);
  const colContato = headerNorm.findIndex((h) => h.includes("nome cliente - contato") || h.includes("cliente contato"));

  const colunasMensaisBrutas: ColunaMensal[] = [];
  header.forEach((raw, idx) => {
    if ([colNome, colNivel, colTipo, colContato, ...colsResponsaveis].includes(idx)) return;
    const norm = headerNorm[idx];
    if (!norm) return;
    const mes = extrairMes(norm);
    const ano = extrairAno(norm);
    const categoria = extrairCategoria(norm);
    if (mes && ano && categoria) {
      colunasMensaisBrutas.push({ col: idx, header: raw, mes, ano, categoria });
    } else if (norm.match(/n[ºo°]?\s*(empregad|socio|autonomo|estagiario)/)) {
      relatorio.avisos.push(`Aba "${sheetName}": coluna "${raw}" parece um bloco mensal mas não foi reconhecida (mês/ano/categoria).`);
    }
  });
  corrigirInconsistenciasDeBloco(colunasMensaisBrutas, sheetName, relatorio.avisos);

  // Colaborador da aba = dono atual da carteira.
  let colaboradorId = colaboradorIdPorNome.get(normalizar(sheetName));
  if (!colaboradorId) {
    const criado = await prisma.colaborador.create({
      data: { nome: sheetName.trim(), nucleoId, nivelTecnico: "T2" },
    });
    colaboradorId = criado.id;
    colaboradorIdPorNome.set(normalizar(sheetName), colaboradorId);
    relatorio.colaboradoresCriados++;
    relatorio.avisos.push(`Colaborador "${sheetName}" criado automaticamente a partir da importação (nível técnico padrão T2, ajuste em Colaboradores).`);
  }

  for (let r = headerRowIdx + 1; r < linhas.length; r++) {
    const linha = linhas[r];
    if (!linha || linha.every((c) => c == null || c === "")) continue;
    const nomeCliente = colNome >= 0 ? valorTexto(linha[colNome]) : null;
    if (!nomeCliente) continue;

    const tipoRaw = colTipo >= 0 ? valorTexto(linha[colTipo]) : null;
    const nivelTexto = colNivel >= 0 ? valorTexto(linha[colNivel]) : null;
    const contato = colContato >= 0 ? valorTexto(linha[colContato]) : null;
    const responsaveisHistorico = colsResponsaveis
      .map((c) => valorTexto(linha[c]))
      .filter((v): v is string => !!v);

    const nomesTipos = tipoRaw ? mapearTipos(tipoRaw) : [];
    const observacoesHistorico =
      responsaveisHistorico.length > 0 ? `Histórico de responsáveis (planilha): ${responsaveisHistorico.join(" → ")}` : null;

    const { clienteId, criado } = await obterOuCriarCliente(nomeCliente, {
      contato,
      nivelOriginalTexto: nivelTexto,
      observacoesHistorico,
      clienteIdPorNome,
    });
    if (criado) relatorio.clientesCriados++;
    else relatorio.clientesAtualizados++;

    await prisma.clienteNucleo.upsert({
      where: { clienteId_nucleoId: { clienteId, nucleoId } },
      update: {},
      create: { clienteId, nucleoId },
    });

    await aplicarTipos(clienteId, nucleoId, nomesTipos, tipoIdPorNome);
    await sincronizarAlocacao(clienteId, colaboradorId, nucleoId, relatorio);

    const volumesPorMes = new Map<string, { mes: number; ano: number; nEmpregados: number | null; nSocios: number | null; nAutonomos: number | null; nEstagiarios: number | null }>();
    for (const colMensal of colunasMensaisBrutas) {
      const valor = valorNumerico(linha[colMensal.col]);
      if (valor === null) continue;
      const chave = `${colMensal.ano}-${colMensal.mes}`;
      const registro = volumesPorMes.get(chave) ?? {
        mes: colMensal.mes,
        ano: colMensal.ano,
        nEmpregados: null,
        nSocios: null,
        nAutonomos: null,
        nEstagiarios: null,
      };
      if (colMensal.categoria === "empregados") registro.nEmpregados = valor;
      if (colMensal.categoria === "socios") registro.nSocios = valor;
      if (colMensal.categoria === "autonomos") registro.nAutonomos = valor;
      if (colMensal.categoria === "estagiarios") registro.nEstagiarios = valor;
      volumesPorMes.set(chave, registro);
    }

    for (const v of volumesPorMes.values()) {
      await prisma.volumeMensalCliente.upsert({
        where: { clienteId_mes_ano: { clienteId, mes: v.mes, ano: v.ano } },
        update: { nEmpregados: v.nEmpregados, nSocios: v.nSocios, nAutonomos: v.nAutonomos, nEstagiarios: v.nEstagiarios },
        create: { clienteId, mes: v.mes, ano: v.ano, nEmpregados: v.nEmpregados, nSocios: v.nSocios, nAutonomos: v.nAutonomos, nEstagiarios: v.nEstagiarios },
      });
      relatorio.volumesGravados++;
    }
  }
}

// ---------------------------------------------------------------------------
// Aba DOMESTICAS (formato simplificado: Cliente + observação)
// ---------------------------------------------------------------------------

async function importarAbaDomesticas(
  linhas: unknown[][],
  sheetName: string,
  nucleoId: string,
  clienteIdPorNome: Map<string, string>,
  tipoIdPorNome: Map<string, string>,
  relatorio: RelatorioImportacao
) {
  const headerRowIdx = encontrarLinhaCabecalho(linhas, ["cliente"]);
  if (headerRowIdx === -1) {
    relatorio.avisos.push(`Aba "${sheetName}": cabeçalho não encontrado, aba ignorada.`);
    return;
  }
  const header = linhas[headerRowIdx].map((h) => (h == null ? "" : normalizar(String(h))));
  const colNome = header.findIndex((h) => h.includes("cliente"));
  const colObs = header.findIndex((h) => h.includes("observa"));

  for (let r = headerRowIdx + 1; r < linhas.length; r++) {
    const linha = linhas[r];
    if (!linha) continue;
    const nome = colNome >= 0 ? valorTexto(linha[colNome]) : null;
    if (!nome) continue;
    const observacao = colObs >= 0 ? valorTexto(linha[colObs]) : null;

    const { clienteId, criado } = await obterOuCriarCliente(nome, {
      contato: null,
      nivelOriginalTexto: null,
      observacoesHistorico: observacao,
      clienteIdPorNome,
    });
    if (criado) relatorio.clientesCriados++;
    else relatorio.clientesAtualizados++;

    await prisma.clienteNucleo.upsert({
      where: { clienteId_nucleoId: { clienteId, nucleoId } },
      update: {},
      create: { clienteId, nucleoId },
    });

    await aplicarTipos(clienteId, nucleoId, ["Doméstica"], tipoIdPorNome);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function obterOuCriarCliente(
  nomeBruto: string,
  dados: {
    contato: string | null;
    nivelOriginalTexto: string | null;
    observacoesHistorico: string | null;
    clienteIdPorNome: Map<string, string>;
  }
): Promise<{ clienteId: string; criado: boolean }> {
  const nome = nomeBruto.trim();
  const chave = normalizar(nome);
  const existenteId = dados.clienteIdPorNome.get(chave);

  if (existenteId) {
    await prisma.cliente.update({
      where: { id: existenteId },
      data: {
        contato: dados.contato ?? undefined,
        nivelOriginalTexto: dados.nivelOriginalTexto ?? undefined,
        observacoesHistorico: dados.observacoesHistorico ?? undefined,
      },
    });
    return { clienteId: existenteId, criado: false };
  }

  const novo = await prisma.cliente.create({
    data: {
      nome,
      contato: dados.contato,
      nivelOriginalTexto: dados.nivelOriginalTexto,
      observacoesHistorico: dados.observacoesHistorico,
    },
  });
  dados.clienteIdPorNome.set(chave, novo.id);
  return { clienteId: novo.id, criado: true };
}

/** Garante que cada nome de tipo exista como TipoCliente do núcleo (cria se preciso) e vincula ao cliente. */
async function aplicarTipos(clienteId: string, nucleoId: string, nomesTipos: string[], tipoIdPorNome: Map<string, string>) {
  for (const nome of nomesTipos) {
    const chave = normalizar(nome);
    let tipoId = tipoIdPorNome.get(chave);
    if (!tipoId) {
      const tipo = await prisma.tipoCliente.upsert({
        where: { nucleoId_nome: { nucleoId, nome } },
        update: {},
        create: { nucleoId, nome },
      });
      tipoId = tipo.id;
      tipoIdPorNome.set(chave, tipoId);
    }
    await prisma.clienteTipo.upsert({
      where: { clienteId_tipoClienteId: { clienteId, tipoClienteId: tipoId } },
      update: {},
      create: { clienteId, nucleoId, tipoClienteId: tipoId },
    });
  }
}

async function sincronizarAlocacao(clienteId: string, colaboradorId: string, nucleoId: string, relatorio: RelatorioImportacao) {
  const ativa = await prisma.alocacao.findFirst({ where: { clienteId, nucleoId, dataFim: null } });
  if (ativa && ativa.colaboradorId === colaboradorId) return;
  if (ativa) {
    await prisma.alocacao.update({ where: { id: ativa.id }, data: { dataFim: new Date() } });
  }
  await prisma.alocacao.create({
    data: { clienteId, colaboradorId, nucleoId, origem: "MANUAL", dataInicio: new Date() },
  });
  relatorio.alocacoesCriadas++;
}

function encontrarLinhaCabecalho(linhas: unknown[][], marcadores: string[]): number {
  for (let r = 0; r < Math.min(linhas.length, 5); r++) {
    const linha = linhas[r];
    if (!linha) continue;
    const normalizada = linha.map((c) => (c == null ? "" : normalizar(String(c))));
    if (marcadores.some((m) => normalizada.some((c) => c.includes(m)))) return r;
  }
  return -1;
}

function extrairMes(headerNorm: string): number | null {
  for (const [chave, valor] of Object.entries(MESES_PT)) {
    if (headerNorm.includes(chave)) return valor;
  }
  return null;
}

function extrairAno(headerNorm: string): number | null {
  const m = headerNorm.match(/\/(\d{2,4})\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n < 100 ? 2000 + n : n;
}

function extrairCategoria(headerNorm: string): ColunaMensal["categoria"] | null {
  if (headerNorm.includes("empregad")) return "empregados";
  if (headerNorm.includes("socio")) return "socios";
  if (headerNorm.includes("autonomo")) return "autonomos";
  if (headerNorm.includes("estagiario")) return "estagiarios";
  return null;
}

/** Corrige colunas com ano/mês divergente dos vizinhos do mesmo bloco (ex.: "setembro/25" cercado de "/26"). */
function corrigirInconsistenciasDeBloco(colunas: ColunaMensal[], sheetName: string, avisos: string[]) {
  for (let i = 0; i < colunas.length; i += 4) {
    const bloco = colunas.slice(i, i + 4);
    if (bloco.length === 0) continue;
    const anoDominante = moda(bloco.map((c) => c.ano));
    const mesDominante = moda(bloco.map((c) => c.mes));
    for (const c of bloco) {
      if (c.ano !== anoDominante) {
        avisos.push(`Aba "${sheetName}": coluna "${c.header}" tinha ano ${c.ano}, assumido ${anoDominante} (inconsistente com as colunas vizinhas do mesmo mês).`);
        c.ano = anoDominante;
      }
      if (c.mes !== mesDominante) {
        avisos.push(`Aba "${sheetName}": coluna "${c.header}" tinha mês divergente do bloco, assumido o mês predominante.`);
        c.mes = mesDominante;
      }
    }
  }
}

function moda(valores: number[]): number {
  const contagem = new Map<number, number>();
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  let melhor = valores[0];
  let max = 0;
  for (const [v, c] of contagem) {
    if (c > max) {
      max = c;
      melhor = v;
    }
  }
  return melhor;
}

function mapearTipos(raw: string): string[] {
  const tokens = raw.split(/[\/,;]/).map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return ["Outro"];
  const tipos = tokens.map(mapearTipoToken);
  return [...new Set(tipos)];
}

/** Reconhece os nomes já usados na planilha real; qualquer texto não reconhecido vira um tipo novo com o próprio nome digitado. */
function mapearTipoToken(token: string): string {
  const n = normalizar(token);
  if (n.includes("folha")) return "Folha";
  if (n.includes("pro labore")) return "Pró-labore";
  if (n.includes("fator r")) return "Fator R";
  if (n.includes("reinf")) return "REINF";
  if (n.includes("sem mov")) return "Sem movimento";
  if (n.includes("livro caixa")) return "Livro Caixa";
  if (n.includes("domestic")) return "Doméstica";
  return token.trim();
}

function valorTexto(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function valorNumerico(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const n = parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(new RegExp("[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]", "g"), "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
