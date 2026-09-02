<?php

require __DIR__ . '/../vendor/autoload.php';

use Sannar\Config;
use Sannar\Http;
use Sannar\Router;
use Sannar\Controllers\AuthController;
use Sannar\Controllers\NucleosController;
use Sannar\Controllers\CriteriosController;
use Sannar\Controllers\FaixasClienteController;
use Sannar\Controllers\FaixasColaboradorController;
use Sannar\Controllers\TiposClienteController;
use Sannar\Controllers\ClientesController;
use Sannar\Controllers\ColaboradoresController;
use Sannar\Controllers\AlocacoesController;
use Sannar\Controllers\TimesheetsController;
use Sannar\Controllers\VolumesController;
use Sannar\Controllers\ImportController;
use Sannar\Controllers\ExportController;
use Sannar\Controllers\DashboardColaboradorController;
use Sannar\Controllers\EficienciaController;
use Sannar\Controllers\DecisoesController;
use Sannar\Controllers\SnapshotsController;
use Sannar\Controllers\UsuariosController;
use Sannar\Controllers\AuditController;
use Sannar\Controllers\RelatoriosController;

$config = Config::get();

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin === $config['client_origin']) {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

session_set_cookie_params([
    'lifetime' => 60 * 60 * 12,
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_name($config['session_name']);
session_start();

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = '/' . ltrim($path, '/');
// O frontend (React) chama tudo com prefixo /api, igual à API Node original — remove esse prefixo aqui.
if (str_starts_with($path, '/api/')) {
    $path = substr($path, 4);
} elseif ($path === '/api') {
    $path = '/';
}

$router = new Router();

// Auth
$router->post('/auth/login', [AuthController::class, 'login']);
$router->post('/auth/logout', [AuthController::class, 'logout']);
$router->get('/auth/me', [AuthController::class, 'me']);
$router->post('/auth/alterar-senha', [AuthController::class, 'alterarSenha']);

// Núcleos
$router->get('/nucleos', [NucleosController::class, 'list']);

// Critérios
$router->get('/criterios', [CriteriosController::class, 'list']);
$router->post('/criterios', [CriteriosController::class, 'create']);
$router->put('/criterios/{id}', [CriteriosController::class, 'update']);
$router->delete('/criterios/{id}', [CriteriosController::class, 'delete']);
$router->delete('/criterios/{id}/definitivo', [CriteriosController::class, 'deleteDefinitivo']);

// Faixas de nível do cliente
$router->get('/faixas-cliente', [FaixasClienteController::class, 'list']);
$router->put('/faixas-cliente/{id}', [FaixasClienteController::class, 'update']);
$router->post('/faixas-cliente/recalibrar', [FaixasClienteController::class, 'recalibrar']);

// Faixas de nível técnico do colaborador + regra de correspondência
$router->get('/faixas-colaborador', [FaixasColaboradorController::class, 'list']);
$router->put('/faixas-colaborador/{id}', [FaixasColaboradorController::class, 'update']);
$router->get('/faixas-colaborador/regras', [FaixasColaboradorController::class, 'listRegras']);
$router->put('/faixas-colaborador/regras/{id}', [FaixasColaboradorController::class, 'updateRegra']);

// Tipos de cliente
$router->get('/tipos-cliente', [TiposClienteController::class, 'list']);
$router->post('/tipos-cliente', [TiposClienteController::class, 'create']);
$router->put('/tipos-cliente/{id}', [TiposClienteController::class, 'update']);

// Clientes
$router->get('/clientes', [ClientesController::class, 'list']);
$router->get('/clientes/{id}', [ClientesController::class, 'get']);
$router->post('/clientes', [ClientesController::class, 'create']);
$router->put('/clientes/{id}', [ClientesController::class, 'update']);
$router->post('/clientes/{id}/tipos', [ClientesController::class, 'setTipos']);
$router->post('/clientes/{id}/pontuacoes', [ClientesController::class, 'pontuar']);
$router->delete('/clientes/{id}', [ClientesController::class, 'delete']);
$router->delete('/clientes/{id}/definitivo', [ClientesController::class, 'deleteDefinitivo']);
$router->post('/clientes/batch/delete', [ClientesController::class, 'batchDelete']);
$router->post('/clientes/batch/toggle-active', [ClientesController::class, 'batchToggleActive']);
$router->post('/clientes/batch/reassign', [ClientesController::class, 'batchReassign']);
$router->post('/clientes/batch/pontuacao', [ClientesController::class, 'batchPontuacao']);

// Colaboradores
$router->get('/colaboradores', [ColaboradoresController::class, 'list']);
$router->get('/colaboradores/{id}', [ColaboradoresController::class, 'get']);
$router->post('/colaboradores', [ColaboradoresController::class, 'create']);
$router->put('/colaboradores/{id}', [ColaboradoresController::class, 'update']);
$router->delete('/colaboradores/{id}', [ColaboradoresController::class, 'delete']);
$router->delete('/colaboradores/{id}/definitivo', [ColaboradoresController::class, 'deleteDefinitivo']);
$router->post('/colaboradores/batch/delete', [ColaboradoresController::class, 'batchDelete']);
$router->post('/colaboradores/batch/toggle-active', [ColaboradoresController::class, 'batchToggleActive']);

// Alocações
$router->get('/alocacoes', [AlocacoesController::class, 'list']);
$router->post('/alocacoes/sugestao', [AlocacoesController::class, 'sugestao']);
$router->post('/alocacoes', [AlocacoesController::class, 'create']);
$router->get('/alocacoes/mapa', [AlocacoesController::class, 'mapa']);

// Timesheets / Volumes
$router->get('/timesheets', [TimesheetsController::class, 'list']);
$router->post('/timesheets', [TimesheetsController::class, 'upsert']);
$router->delete('/timesheets/{id}', [TimesheetsController::class, 'delete']);
$router->get('/volumes', [VolumesController::class, 'list']);
$router->post('/volumes', [VolumesController::class, 'upsert']);
$router->delete('/volumes/{id}', [VolumesController::class, 'delete']);

// Import / Export
$router->post('/import/pessoal', [ImportController::class, 'pessoal']);
$router->get('/export/pessoal.xlsx', [ExportController::class, 'pessoal']);

// Dashboards e relatórios
$router->get('/dashboard-colaborador/{id}', [DashboardColaboradorController::class, 'get']);
$router->get('/eficiencia/colaboradores', [EficienciaController::class, 'colaboradores']);
$router->get('/eficiencia/nucleos', [EficienciaController::class, 'nucleos']);
$router->get('/eficiencia/empresa', [EficienciaController::class, 'empresa']);
$router->get('/decisoes', [DecisoesController::class, 'list']);
$router->post('/snapshots/recalcular', [SnapshotsController::class, 'recalcular']);

$router->get('/relatorios/colaborador/{id}', [RelatoriosController::class, 'colaboradorJson']);
$router->get('/relatorios/colaborador/{id}/pdf', [RelatoriosController::class, 'colaboradorPdf']);
$router->get('/relatorios/nucleo/{nucleoId}/desempenho', [RelatoriosController::class, 'desempenhoJson']);
$router->get('/relatorios/nucleo/{nucleoId}/desempenho/pdf', [RelatoriosController::class, 'desempenhoPdf']);
$router->get('/relatorios/nucleo/{nucleoId}/custos', [RelatoriosController::class, 'custosJson']);
$router->get('/relatorios/nucleo/{nucleoId}/custos/pdf', [RelatoriosController::class, 'custosPdf']);
$router->get('/relatorios/nucleo/{nucleoId}/clientes-por-tipo', [RelatoriosController::class, 'clientesPorTipoJson']);
$router->get('/relatorios/nucleo/{nucleoId}/clientes-por-tipo/pdf', [RelatoriosController::class, 'clientesPorTipoPdf']);

// Usuários / Auditoria
$router->get('/usuarios', [UsuariosController::class, 'list']);
$router->post('/usuarios', [UsuariosController::class, 'create']);
$router->put('/usuarios/{id}', [UsuariosController::class, 'update']);
$router->post('/usuarios/{id}/reset-senha', [UsuariosController::class, 'resetSenha']);
$router->delete('/usuarios/{id}', [UsuariosController::class, 'delete']);
$router->get('/audit', [AuditController::class, 'list']);

$router->get('/health', function () {
    Http::json(['ok' => true]);
});

$router->dispatch($_SERVER['REQUEST_METHOD'], $path);
