-- Schema MySQL do Sistema de Carteira e Eficiência - Sannar Contabilidade
-- Equivalente ao server/prisma/schema.prisma (versão Node/SQLite original).
-- IDs são UUID v4 (CHAR(36)), gerados em PHP (ver src/Uuid.php).

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- Núcleos e usuários de login
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS nucleo (
  id CHAR(36) PRIMARY KEY,
  nome VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- role: DIRECAO | LIDER_NUCLEO
CREATE TABLE IF NOT EXISTS user (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  passwordHash VARCHAR(255) NOT NULL,
  nome VARCHAR(150) NOT NULL,
  role VARCHAR(20) NOT NULL,
  nucleoId CHAR(36) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (nucleoId) REFERENCES nucleo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Parametrização de complexidade do cliente (por núcleo)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS criteriocliente (
  id CHAR(36) PRIMARY KEY,
  nucleoId CHAR(36) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  descricao TEXT NULL,
  peso DOUBLE NOT NULL DEFAULT 1,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (nucleoId) REFERENCES nucleo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- nivel: N1 | N2 | N3 | N4
CREATE TABLE IF NOT EXISTS faixanivelcliente (
  id CHAR(36) PRIMARY KEY,
  nucleoId CHAR(36) NOT NULL,
  nivel VARCHAR(10) NOT NULL,
  pontuacaoMin DOUBLE NOT NULL,
  pontuacaoMax DOUBLE NOT NULL,
  FOREIGN KEY (nucleoId) REFERENCES nucleo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cliente (
  id CHAR(36) PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  contato VARCHAR(255) NULL,
  nivelOriginalTexto VARCHAR(255) NULL,
  observacoesHistorico TEXT NULL,
  dataCadastro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  deletedAt DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clientenucleo (
  id CHAR(36) PRIMARY KEY,
  clienteId CHAR(36) NOT NULL,
  nucleoId CHAR(36) NOT NULL,
  UNIQUE KEY uq_cliente_nucleo (clienteId, nucleoId),
  FOREIGN KEY (clienteId) REFERENCES cliente(id),
  FOREIGN KEY (nucleoId) REFERENCES nucleo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tipo de cliente: configurável por núcleo.
CREATE TABLE IF NOT EXISTS tipocliente (
  id CHAR(36) PRIMARY KEY,
  nucleoId CHAR(36) NOT NULL,
  nome VARCHAR(100) NOT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_tipo_nucleo_nome (nucleoId, nome),
  FOREIGN KEY (nucleoId) REFERENCES nucleo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clientetipo (
  id CHAR(36) PRIMARY KEY,
  clienteId CHAR(36) NOT NULL,
  nucleoId CHAR(36) NOT NULL,
  tipoClienteId CHAR(36) NOT NULL,
  UNIQUE KEY uq_cliente_tipo (clienteId, tipoClienteId),
  FOREIGN KEY (clienteId) REFERENCES cliente(id),
  FOREIGN KEY (nucleoId) REFERENCES nucleo(id),
  FOREIGN KEY (tipoClienteId) REFERENCES tipocliente(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- valor: 1-5 ; mesReferencia: "YYYY-MM" ou NULL (modo estático, vale até reavaliar)
CREATE TABLE IF NOT EXISTS pontuacaocriteriocliente (
  id CHAR(36) PRIMARY KEY,
  clienteId CHAR(36) NOT NULL,
  nucleoId CHAR(36) NOT NULL,
  criterioId CHAR(36) NOT NULL,
  valor INT NOT NULL,
  mesReferencia VARCHAR(7) NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (clienteId) REFERENCES cliente(id),
  FOREIGN KEY (nucleoId) REFERENCES nucleo(id),
  FOREIGN KEY (criterioId) REFERENCES criteriocliente(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS volumemensalcliente (
  id CHAR(36) PRIMARY KEY,
  clienteId CHAR(36) NOT NULL,
  mes INT NOT NULL,
  ano INT NOT NULL,
  nEmpregados INT NULL,
  nSocios INT NULL,
  nAutonomos INT NULL,
  nEstagiarios INT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_volume_cliente_mes_ano (clienteId, mes, ano),
  FOREIGN KEY (clienteId) REFERENCES cliente(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Colaboradores
-- ---------------------------------------------------------------------------

-- nivelTecnico: T1 | T2 | T3 | T4
CREATE TABLE IF NOT EXISTS colaborador (
  id CHAR(36) PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  nucleoId CHAR(36) NOT NULL,
  nivelTecnico VARCHAR(10) NOT NULL,
  dataAdmissao DATE NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  deletedAt DATETIME NULL,
  remuneracaoTotal DOUBLE NOT NULL DEFAULT 0,
  capacidadeMaximaPontos DOUBLE NULL,
  excecaoNivelClienteMax VARCHAR(10) NULL,
  FOREIGN KEY (nucleoId) REFERENCES nucleo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS colaboradornivelhistorico (
  id CHAR(36) PRIMARY KEY,
  colaboradorId CHAR(36) NOT NULL,
  nivelTecnico VARCHAR(10) NOT NULL,
  dataInicio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (colaboradorId) REFERENCES colaborador(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- nivel: T1 | T2 | T3 | T4
CREATE TABLE IF NOT EXISTS faixanivelcolaborador (
  id CHAR(36) PRIMARY KEY,
  nucleoId CHAR(36) NOT NULL,
  nivel VARCHAR(10) NOT NULL,
  descricaoCompetencias TEXT NULL,
  FOREIGN KEY (nucleoId) REFERENCES nucleo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS regracorrespondencia (
  id CHAR(36) PRIMARY KEY,
  nucleoId CHAR(36) NOT NULL,
  nivelTecnico VARCHAR(10) NOT NULL,
  nivelClienteMaximo VARCHAR(10) NOT NULL,
  UNIQUE KEY uq_regra_nucleo_nivel (nucleoId, nivelTecnico),
  FOREIGN KEY (nucleoId) REFERENCES nucleo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Alocação, eficiência e histórico
-- ---------------------------------------------------------------------------

-- origem: MANUAL | SUGESTAO
CREATE TABLE IF NOT EXISTS alocacao (
  id CHAR(36) PRIMARY KEY,
  clienteId CHAR(36) NOT NULL,
  colaboradorId CHAR(36) NOT NULL,
  nucleoId CHAR(36) NOT NULL,
  dataInicio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dataFim DATETIME NULL,
  origem VARCHAR(20) NOT NULL,
  FOREIGN KEY (clienteId) REFERENCES cliente(id),
  FOREIGN KEY (colaboradorId) REFERENCES colaborador(id),
  FOREIGN KEY (nucleoId) REFERENCES nucleo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lançamento mensal de eficiência: campo único (% de 0 a 100).
CREATE TABLE IF NOT EXISTS timesheetmensal (
  id CHAR(36) PRIMARY KEY,
  colaboradorId CHAR(36) NOT NULL,
  mes INT NOT NULL,
  ano INT NOT NULL,
  eficiencia DOUBLE NOT NULL,
  observacao TEXT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_timesheet_colab_mes_ano (colaboradorId, mes, ano),
  FOREIGN KEY (colaboradorId) REFERENCES colaborador(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS carteirasnapshotmensal (
  id CHAR(36) PRIMARY KEY,
  colaboradorId CHAR(36) NOT NULL,
  mes INT NOT NULL,
  ano INT NOT NULL,
  pontuacaoTotal DOUBLE NOT NULL,
  nClientes INT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_snapshot_colab_mes_ano (colaboradorId, mes, ano),
  FOREIGN KEY (colaboradorId) REFERENCES colaborador(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auditlog (
  id CHAR(36) PRIMARY KEY,
  userId CHAR(36) NULL,
  acao VARCHAR(50) NOT NULL,
  entidade VARCHAR(50) NOT NULL,
  entidadeId CHAR(36) NULL,
  detalhe TEXT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
