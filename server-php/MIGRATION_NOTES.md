# Reescrita PHP/MySQL — Notas de migração

Reescrita completa do backend (pasta `server/`, Node.js/Express/Prisma/SQLite) para PHP + MySQL,
para rodar em hospedagem compartilhada comum (cPanel sem "Setup Node.js App", só PHP + MySQL,
sem SSH/terminal). O frontend (`client/`, React) **não precisa de nenhuma mudança** — a API PHP
responde nos mesmos endpoints `/api/...`, com os mesmos formatos de request/response da API Node.

## Status: completo e validado

Todas as 9 áreas da lista de prioridade foram implementadas e testadas contra o arquivo real
(`Planilha Clientes Separados Individual...xlsx`), com **resultado idêntico ao da versão Node**
(437 clientes, 8 colaboradores, 1846 volumes mensais, 398 alocações, mesmos avisos de
inconsistência de ano na importação):

1. ✅ Schema MySQL (`database.sql`) + camada de conexão PDO
2. ✅ Autenticação (sessão nativa do PHP, bcrypt) + RBAC por núcleo (testado: Líder de Núcleo
   recebe 403 ao tentar acessar outro núcleo, mesmo manipulando a URL diretamente)
3. ✅ CRUD completo: núcleos, critérios, faixas de nível (cliente e colaborador), regra de
   correspondência, tipos de cliente (configurável por núcleo), clientes, colaboradores,
   alocações, timesheets, volumes, usuários, auditoria
4. ✅ Motores de negócio: pontuação (`Services/Scoring.php`), sugestão de alocação
   (`Services/AllocationSuggestion.php`), alertas — os 6 tipos (`Services/Alerts.php`)
5. ✅ Importador/exportador de Excel (`Services/ExcelImport.php` / `ExcelExport.php`, via
   PhpSpreadsheet) — testado byte-a-byte contra o arquivo real, resultado idêntico ao Node
6. ✅ Os 4 relatórios em PDF (`Services/PdfHelpers.php` + `Controllers/RelatoriosController.php`,
   via TCPDF): individual do colaborador, desempenho do núcleo, custo consolidado, clientes por
   tipo — testados, PDFs renderizam corretamente com paginação automática
7. ✅ Ações em lote: excluir/ativar/desativar/reatribuir clientes e colaboradores, avaliar em lote

## Decisões técnicas

- **Sem framework**: PHP puro + PDO, roteador próprio (`src/Router.php`, ~40 linhas). Hospedagem
  compartilhada não tem SSH para instalar/atualizar um framework — menos dependências, mais
  fácil de fazer deploy só copiando arquivos.
- **Autenticação por sessão nativa do PHP** (`session_start()`, cookie httpOnly) em vez de JWT —
  mais simples e já vem pronta no PHP, sem precisar de biblioteca extra.
- **IDs em UUID v4** (`src/Uuid.php`) em vez do `cuid()` do Prisma — mesma ideia (chave primária
  única gerada na aplicação), só a biblioteca que muda.
- **Nomes de tabela em minúsculas** (`nucleo`, `cliente`, etc.) de propósito — MySQL no Windows é
  case-insensitive para nomes de tabela, mas em Linux (produção) depende da configuração do
  servidor (`lower_case_table_names`). Usar minúsculo em tudo evita esse problema totalmente.
- **PhpSpreadsheet** (import/export de Excel) e **TCPDF** (relatórios PDF) via Composer — ver
  "Dependências" abaixo, a pasta `vendor/` já vem pronta no repositório.

## Dependências (`vendor/`) — importante

A hospedagem de destino **não tem Composer nem SSH**, só aceita upload de arquivos prontos. Por
isso a pasta `vendor/` (gerada por `composer install` neste ambiente de desenvolvimento) **está
commitada no repositório**, não está no `.gitignore`. Isso é intencional — não remova. Se precisar
adicionar/atualizar uma dependência, rode `composer install`/`update` localmente (com PHP e
Composer instalados) e commite a `vendor/` atualizada junto.

## Como testar localmente

Requer PHP 8.1+, Composer e um servidor MySQL/MariaDB.

```bash
cd server-php
composer install          # só necessário se for alterar dependências; vendor/ já vem pronto
cp .env.example .env       # e edite com as credenciais do seu MySQL local
mysql -u root -p seu_banco < database.sql
php seed.php                # cria núcleos, critérios, faixas e o usuário Direção
php -S localhost:8000 -t public router-dev.php   # sobe a API em http://localhost:8000
```

O frontend (`client/`) precisa apontar o proxy da Vite (`vite.config.ts`) para
`http://localhost:8000` em vez de `http://localhost:4000` durante o teste local desta versão.

## Como publicar na hospedagem (cPanel compartilhado)

1. No cPanel, em **MySQL Databases**, crie um banco e um usuário com todos os privilégios nesse
   banco (anote nome do banco, usuário e senha — o cPanel geralmente prefixa ambos com o nome da
   conta, ex. `usuario_sannar`).
2. Em **phpMyAdmin**, abra o banco criado e importe `database.sql` (aba "Importar").
3. Rode `seed.php` uma vez para popular núcleos/critérios/faixas e criar o usuário Direção — como
   não há SSH, a forma mais simples é criar uma cópia temporária de `seed.php` acessível por URL
   (ex. `public/seed-inicial.php` chamando o mesmo código), rodar uma vez pelo navegador, anotar a
   senha temporária mostrada, e **apagar esse arquivo em seguida** por segurança.
4. Suba a pasta `server-php` inteira (exceto `.env`, que você vai criar direto no servidor) para
   fora da pasta pública do site — ex. `/home/usuario/sannar-api/` (um nível acima de
   `public_html`), mantendo `public/` dentro dela.
5. Em **Domains** (cPanel), crie um subdomínio (ex. `sistema.sannar.com.br`) apontando o
   **Document Root** diretamente para `/home/usuario/sannar-api/server-php/public` — isso deixa
   `src/`, `vendor/` e o `.env` fora do alcance público, só `public/` fica acessível pela web.
6. Crie o arquivo `.env` dentro de `server-php/` (mesmo nível de `composer.json`, **fora** de
   `public/`) com as credenciais reais do MySQL do passo 1 e `CLIENT_ORIGIN` apontando para onde
   o frontend React vai ficar publicado.
7. Publique o build do frontend (`cd client && npm run build`, sobe o conteúdo de `client/dist/`)
   em `public_html` (ou noutro subdomínio) apontando as chamadas de API para o endereço do passo 5.

## O que não foi migrado (por não haver necessidade)

- Dados reais de produção: o arquivo SQLite com os dados de clientes nunca é commitado no
  repositório (propositalmente), então não havia dados para migrar aqui. Depois do deploy, use a
  tela **Importar/Exportar** do próprio sistema para reimportar a planilha real — é idempotente
  (não duplica clientes já existentes).
