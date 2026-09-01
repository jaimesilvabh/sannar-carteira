-- CreateTable
CREATE TABLE "Nucleo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "nucleoId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_nucleoId_fkey" FOREIGN KEY ("nucleoId") REFERENCES "Nucleo" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CriterioCliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nucleoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "peso" REAL NOT NULL DEFAULT 1,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CriterioCliente_nucleoId_fkey" FOREIGN KEY ("nucleoId") REFERENCES "Nucleo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FaixaNivelCliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nucleoId" TEXT NOT NULL,
    "nivel" TEXT NOT NULL,
    "pontuacaoMin" REAL NOT NULL,
    "pontuacaoMax" REAL NOT NULL,
    CONSTRAINT "FaixaNivelCliente_nucleoId_fkey" FOREIGN KEY ("nucleoId") REFERENCES "Nucleo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "contato" TEXT,
    "tipos" TEXT NOT NULL DEFAULT '[]',
    "nivelOriginalTexto" TEXT,
    "observacoesHistorico" TEXT,
    "dataCadastro" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ClienteNucleo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clienteId" TEXT NOT NULL,
    "nucleoId" TEXT NOT NULL,
    CONSTRAINT "ClienteNucleo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClienteNucleo_nucleoId_fkey" FOREIGN KEY ("nucleoId") REFERENCES "Nucleo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PontuacaoCriterioCliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clienteId" TEXT NOT NULL,
    "nucleoId" TEXT NOT NULL,
    "criterioId" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "mesReferencia" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PontuacaoCriterioCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PontuacaoCriterioCliente_nucleoId_fkey" FOREIGN KEY ("nucleoId") REFERENCES "Nucleo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PontuacaoCriterioCliente_criterioId_fkey" FOREIGN KEY ("criterioId") REFERENCES "CriterioCliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VolumeMensalCliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clienteId" TEXT NOT NULL,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "nEmpregados" INTEGER,
    "nSocios" INTEGER,
    "nAutonomos" INTEGER,
    "nEstagiarios" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "VolumeMensalCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Colaborador" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "nucleoId" TEXT NOT NULL,
    "nivelTecnico" TEXT NOT NULL,
    "dataAdmissao" DATETIME,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "remuneracaoTotal" REAL NOT NULL DEFAULT 0,
    "capacidadeMaximaPontos" REAL,
    "excecaoNivelClienteMax" TEXT,
    CONSTRAINT "Colaborador_nucleoId_fkey" FOREIGN KEY ("nucleoId") REFERENCES "Nucleo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ColaboradorNivelHistorico" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "colaboradorId" TEXT NOT NULL,
    "nivelTecnico" TEXT NOT NULL,
    "dataInicio" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ColaboradorNivelHistorico_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FaixaNivelColaborador" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nucleoId" TEXT NOT NULL,
    "nivel" TEXT NOT NULL,
    "descricaoCompetencias" TEXT,
    CONSTRAINT "FaixaNivelColaborador_nucleoId_fkey" FOREIGN KEY ("nucleoId") REFERENCES "Nucleo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RegraCorrespondencia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nucleoId" TEXT NOT NULL,
    "nivelTecnico" TEXT NOT NULL,
    "nivelClienteMaximo" TEXT NOT NULL,
    CONSTRAINT "RegraCorrespondencia_nucleoId_fkey" FOREIGN KEY ("nucleoId") REFERENCES "Nucleo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alocacao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clienteId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "nucleoId" TEXT NOT NULL,
    "dataInicio" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFim" DATETIME,
    "origem" TEXT NOT NULL,
    CONSTRAINT "Alocacao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Alocacao_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Alocacao_nucleoId_fkey" FOREIGN KEY ("nucleoId") REFERENCES "Nucleo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimesheetMensal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "colaboradorId" TEXT NOT NULL,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "horasDisponiveis" REAL,
    "horasApontadas" REAL,
    "percentualDireto" REAL,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "TimesheetMensal_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CarteiraSnapshotMensal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "colaboradorId" TEXT NOT NULL,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "pontuacaoTotal" REAL NOT NULL,
    "nClientes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CarteiraSnapshotMensal_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "detalhe" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Nucleo_nome_key" ON "Nucleo"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ClienteNucleo_clienteId_nucleoId_key" ON "ClienteNucleo"("clienteId", "nucleoId");

-- CreateIndex
CREATE UNIQUE INDEX "VolumeMensalCliente_clienteId_mes_ano_key" ON "VolumeMensalCliente"("clienteId", "mes", "ano");

-- CreateIndex
CREATE UNIQUE INDEX "RegraCorrespondencia_nucleoId_nivelTecnico_key" ON "RegraCorrespondencia"("nucleoId", "nivelTecnico");

-- CreateIndex
CREATE UNIQUE INDEX "TimesheetMensal_colaboradorId_mes_ano_key" ON "TimesheetMensal"("colaboradorId", "mes", "ano");

-- CreateIndex
CREATE UNIQUE INDEX "CarteiraSnapshotMensal_colaboradorId_mes_ano_key" ON "CarteiraSnapshotMensal"("colaboradorId", "mes", "ano");
