# Sannar · Carteira e Eficiência

Sistema interno (web, local, single-tenant) de parametrização de carteira e eficiência da Sannar Contabilidade. Primeira etapa: núcleo **Pessoal** ponta a ponta, com a estrutura de critérios já generalizada (seed) para Fiscal e Contábil.

Stack: Node.js + Express + TypeScript + Prisma + SQLite (backend) · React + Vite + TypeScript + Tailwind (frontend).

## Como rodar

Pré-requisito: Node.js 18+ (o instalador do projeto já cuidou disso nesta máquina).

```bash
# Backend
cd server
npm install          # já feito
npx prisma migrate dev   # já feito — cria/atualiza o banco em server/prisma/data/sannar.db
npm run seed          # já feito — cria núcleos, critérios, faixas e o usuário Direção
npm run dev            # sobe em http://localhost:4000

# Frontend (em outro terminal)
cd client
npm install           # já feito
npm run dev            # sobe em http://localhost:5173
```

Acesse **http://localhost:5173**.

## Login inicial (Direção)

- **E-mail:** jaimesilvabh@gmail.com
- **Senha temporária:** gerada no primeiro `npm run seed` e impressa no console (guarde-a — ela não é salva em nenhum arquivo). Troque-a depois de entrar, em Usuários → Resetar senha, ou implemente o fluxo "Alterar senha" já disponível na API (`POST /api/auth/alterar-senha`).

Se perder a senha, rode novamente `npm run seed` — como o usuário já existe, ele não recria a conta; use `POST /api/usuarios/:id/reset-senha` (como Direção) ou gere uma nova via script.

## Estrutura

```
server/   API (Express + Prisma/SQLite)
client/   Frontend (React + Vite)
```

Veja o schema completo do banco em `server/prisma/schema.prisma` e as rotas em `server/src/routes/`.

## Importação da planilha real (núcleo Pessoal)

Em **Importar/Exportar**, envie o arquivo `.xlsx` no formato real (uma aba por colaborador + blocos mensais de Empregados/Sócios/Autônomos/Estagiários, aba `DOMESTICAS`). O importador:

- é tolerante a variações de cabeçalho (acentos, espaços, `/25` vs `/26`);
- nunca aborta a importação inteira por uma linha ruim — acumula avisos e mostra no relatório final;
- casa clientes existentes pelo nome (reimportar atualiza, não duplica);
- **não inventa pontuação por critério** a partir do texto livre "baixa/média/alta" da planilha — os clientes entram como "Não avaliado" até serem avaliados critério a critério na tela de Clientes. O texto original fica guardado como referência.

## Próximos passos sugeridos (fora do escopo desta etapa)

- Avaliar os ~437 clientes importados critério a critério (tela Clientes) para que os níveis (N1–N4) deixem de aparecer como "Não avaliado".
- Definir `capacidadeMaximaPontos` de cada colaborador (Colaboradores → editar) para habilitar os cálculos de carga e os alertas de sobrecarga/contratação.
- Lançar eficiência mensal (horas ou %) por colaborador para popular os heatmaps.
- Replicar critérios/faixas para os núcleos Fiscal e Contábil (já com estrutura pronta em Configuração) e depois construir os importadores específicos deles.
