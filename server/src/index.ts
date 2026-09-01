import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { authRouter } from "./routes/auth";
import { nucleosRouter } from "./routes/nucleos";
import { criteriosRouter } from "./routes/criterios";
import { faixasClienteRouter } from "./routes/faixasCliente";
import { faixasColaboradorRouter } from "./routes/faixasColaborador";
import { tiposClienteRouter } from "./routes/tiposCliente";
import { relatoriosRouter } from "./routes/relatorios";
import { clientesRouter } from "./routes/clientes";
import { colaboradoresRouter } from "./routes/colaboradores";
import { alocacoesRouter } from "./routes/alocacoes";
import { timesheetsRouter } from "./routes/timesheets";
import { volumesRouter } from "./routes/volumes";
import { importRouter } from "./routes/import";
import { exportRouter } from "./routes/exportRoute";
import { dashboardColaboradorRouter } from "./routes/dashboardColaborador";
import { eficienciaRouter } from "./routes/eficiencia";
import { decisoesRouter } from "./routes/decisoes";
import { snapshotsRouter } from "./routes/snapshots";
import { usuariosRouter } from "./routes/usuarios";
import { auditRouter } from "./routes/audit";
import { HttpError } from "./lib/httpError";
import { NucleoForbiddenError } from "./middleware/scopeNucleo";

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/nucleos", nucleosRouter);
app.use("/api/criterios", criteriosRouter);
app.use("/api/faixas-cliente", faixasClienteRouter);
app.use("/api/faixas-colaborador", faixasColaboradorRouter);
app.use("/api/tipos-cliente", tiposClienteRouter);
app.use("/api/relatorios", relatoriosRouter);
app.use("/api/clientes", clientesRouter);
app.use("/api/colaboradores", colaboradoresRouter);
app.use("/api/alocacoes", alocacoesRouter);
app.use("/api/timesheets", timesheetsRouter);
app.use("/api/volumes", volumesRouter);
app.use("/api/import", importRouter);
app.use("/api/export", exportRouter);
app.use("/api/dashboard-colaborador", dashboardColaboradorRouter);
app.use("/api/eficiencia", eficienciaRouter);
app.use("/api/decisoes", decisoesRouter);
app.use("/api/snapshots", snapshotsRouter);
app.use("/api/usuarios", usuariosRouter);
app.use("/api/audit", auditRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof NucleoForbiddenError) return res.status(403).json({ error: err.message });
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor" });
});

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Servidor Sannar Carteira rodando em http://localhost:${PORT}`);
});
