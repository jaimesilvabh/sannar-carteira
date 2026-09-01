import { prisma } from "../src/lib/prisma";
import { hashPassword, gerarSenhaTemporaria } from "../src/auth/hash";
import { NOMES_NUCLEOS } from "../src/lib/constants";

const CRITERIOS_POR_NUCLEO: Record<string, string[]> = {
  Pessoal: [
    "Nº de funcionários ativos",
    "Nº de convenções coletivas/sindicatos distintos",
    "Rotatividade (admissões/demissões por mês)",
    "Diversidade de benefícios (VR/VT, plano de saúde, PLR, flexíveis)",
    "Cargos comissionados/variáveis/horas extras",
    "Processos trabalhistas ativos",
    "Terceirizados/PJs junto com CLT",
    "Múltiplos estabelecimentos com FAP/RAT diferentes",
  ],
  Fiscal: [
    "Regime tributário (MEI/Simples/Presumido/Real)",
    "Nº de estabelecimentos/filiais e UFs",
    "Volume de notas fiscais/mês",
    "Créditos tributários / não-cumulatividade",
    "Comércio exterior",
    "Obrigações acessórias específicas (ECF, Bloco K, EFD-Contribuições, e-Financeira)",
    "Histórico de malha fina/autuações/parcelamentos",
    "Necessidade de planejamento tributário ativo",
  ],
  "Contábil": [
    "Volume de lançamentos/mês",
    "Consolidação (grupo econômico)",
    "Auditoria externa",
    "Complexidade de demonstrações societárias (DFC, DVA, notas explicativas)",
    "Ativo imobilizado relevante",
    "Frequência de operações societárias (fusão, cisão, incorporação, aumento de capital)",
    "Multiplicidade de contas bancárias/moedas",
    "Relatórios gerenciais customizados",
  ],
};

const FAIXAS_DEFAULT = [
  { nivel: "N1", pontuacaoMin: 0, pontuacaoMax: 14 },
  { nivel: "N2", pontuacaoMin: 15, pontuacaoMax: 22 },
  { nivel: "N3", pontuacaoMin: 23, pontuacaoMax: 30 },
  { nivel: "N4", pontuacaoMin: 31, pontuacaoMax: 999 },
];

const NIVEIS_TECNICOS_DESC: Record<string, string> = {
  T1: "Em formação — executa tarefas rotineiras sob supervisão direta.",
  T2: "Analista — autonomia em clientes de complexidade baixa/média.",
  T3: "Sênior — autonomia em clientes complexos, revisa trabalho de T1/T2.",
  T4: "Especialista — referência técnica, atende os clientes mais críticos e estratégicos.",
};

const REGRA_DEFAULT: [string, string][] = [
  ["T1", "N1"],
  ["T2", "N2"],
  ["T3", "N3"],
  ["T4", "N4"],
];

async function main() {
  const nucleoIdPorNome = new Map<string, string>();
  for (const nome of NOMES_NUCLEOS) {
    const n = await prisma.nucleo.upsert({ where: { nome }, update: {}, create: { nome } });
    nucleoIdPorNome.set(nome, n.id);
  }

  for (const [nomeNucleo, criterios] of Object.entries(CRITERIOS_POR_NUCLEO)) {
    const nucleoId = nucleoIdPorNome.get(nomeNucleo)!;
    for (const nomeCriterio of criterios) {
      const existente = await prisma.criterioCliente.findFirst({ where: { nucleoId, nome: nomeCriterio } });
      if (!existente) {
        await prisma.criterioCliente.create({ data: { nucleoId, nome: nomeCriterio, peso: 1, ativo: true } });
      }
    }
  }

  for (const nucleoId of nucleoIdPorNome.values()) {
    for (const f of FAIXAS_DEFAULT) {
      const existente = await prisma.faixaNivelCliente.findFirst({ where: { nucleoId, nivel: f.nivel } });
      if (!existente) await prisma.faixaNivelCliente.create({ data: { nucleoId, ...f } });
    }
    for (const [nivel, descricao] of Object.entries(NIVEIS_TECNICOS_DESC)) {
      const existente = await prisma.faixaNivelColaborador.findFirst({ where: { nucleoId, nivel } });
      if (!existente) await prisma.faixaNivelColaborador.create({ data: { nucleoId, nivel, descricaoCompetencias: descricao } });
    }
    for (const [nivelTecnico, nivelClienteMaximo] of REGRA_DEFAULT) {
      await prisma.regraCorrespondencia.upsert({
        where: { nucleoId_nivelTecnico: { nucleoId, nivelTecnico } },
        update: {},
        create: { nucleoId, nivelTecnico, nivelClienteMaximo },
      });
    }
  }

  const emailDirecao = "jaimesilvabh@gmail.com";
  const existente = await prisma.user.findUnique({ where: { email: emailDirecao } });
  if (!existente) {
    const senha = gerarSenhaTemporaria();
    const passwordHash = await hashPassword(senha);
    await prisma.user.create({
      data: { email: emailDirecao, passwordHash, nome: "Direção", role: "DIRECAO", nucleoId: null },
    });
    console.log("=========================================================");
    console.log("Usuário Direção criado:");
    console.log("  e-mail: " + emailDirecao);
    console.log("  senha temporária: " + senha);
    console.log("  (troque a senha em Usuários após o primeiro login)");
    console.log("=========================================================");
  } else {
    console.log("Usuário Direção já existe, seed de usuário ignorado.");
  }

  console.log("Seed concluído.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
