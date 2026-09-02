<?php

namespace Sannar\Controllers;

use Sannar\Audit;
use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;
use Sannar\HttpException;
use Sannar\Rbac;
use Sannar\Services\AllocationSuggestion;
use Sannar\Services\Scoring;

class AlocacoesController
{
    private const NIVEIS_CLIENTE = ['N1', 'N2', 'N3', 'N4'];

    public static function list(array $params): void
    {
        Auth::requireAuth();
        $nucleoId = Http::query('nucleoId');
        if ($nucleoId) {
            Rbac::assertNucleoAccess($nucleoId);
        }
        $permitidos = Rbac::scopedNucleoIds();

        $where = [];
        $args = [];
        if ($nucleoId) {
            $where[] = 'a.nucleoId = ?';
            $args[] = $nucleoId;
        } elseif ($permitidos !== null) {
            if (count($permitidos) === 0) {
                Http::json([]);
                return;
            }
            $ph = implode(',', array_fill(0, count($permitidos), '?'));
            $where[] = "a.nucleoId IN ($ph)";
            array_push($args, ...$permitidos);
        }
        if ($colaboradorId = Http::query('colaboradorId')) {
            $where[] = 'a.colaboradorId = ?';
            $args[] = $colaboradorId;
        }
        if ($clienteId = Http::query('clienteId')) {
            $where[] = 'a.clienteId = ?';
            $args[] = $clienteId;
        }
        $where[] = Http::query('ativo') === 'false' ? 'a.dataFim IS NOT NULL' : 'a.dataFim IS NULL';

        $whereSql = 'WHERE ' . implode(' AND ', $where);
        $sql = "SELECT a.*, c.nome AS clienteNome, col.nome AS colaboradorNome FROM alocacao a
                INNER JOIN cliente c ON c.id = a.clienteId
                INNER JOIN colaborador col ON col.id = a.colaboradorId
                $whereSql ORDER BY a.dataInicio DESC";
        $stmt = Database::get()->prepare($sql);
        $stmt->execute($args);
        Http::json($stmt->fetchAll());
    }

    public static function sugestao(array $params): void
    {
        Auth::requireAuth();
        $body = Http::body();
        $clienteId = Http::required($body, 'clienteId');
        $nucleoId = Http::required($body, 'nucleoId');
        Rbac::assertNucleoAccess($nucleoId);

        $pontuacao = Scoring::calcularPontuacaoCliente($clienteId, $nucleoId);
        if (!$pontuacao['nivel']) {
            throw new HttpException(400, 'Cliente ainda não foi avaliado neste núcleo — não é possível sugerir alocação.');
        }
        $top = Http::query('top') ? (int) Http::query('top') : 5;
        $sugestoes = AllocationSuggestion::sugerirColaboradores($nucleoId, $pontuacao['nivel'], $top);
        Http::json(['nivelCliente' => $pontuacao['nivel'], 'pontuacaoTotal' => $pontuacao['pontuacaoTotal'], 'sugestoes' => $sugestoes]);
    }

    public static function create(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $body = Http::body();
        $clienteId = Http::required($body, 'clienteId');
        $colaboradorId = Http::required($body, 'colaboradorId');
        $nucleoId = Http::required($body, 'nucleoId');
        Rbac::assertNucleoAccess($nucleoId);
        $origem = ($body['origem'] ?? '') === 'SUGESTAO' ? 'SUGESTAO' : 'MANUAL';

        $alocacao = AllocationSuggestion::alocarCliente($clienteId, $colaboradorId, $nucleoId, $origem);
        Audit::registrar('ALOCAR', 'Alocacao', $alocacao['id'], ['clienteId' => $clienteId, 'colaboradorId' => $colaboradorId, 'nucleoId' => $nucleoId, 'origem' => $origem]);
        Http::json($alocacao, 201);
    }

    /** Matriz núcleo x colaborador x nível de cliente. */
    public static function mapa(array $params): void
    {
        Auth::requireAuth();
        $nucleoId = Http::required($_GET, 'nucleoId');
        Rbac::assertNucleoAccess($nucleoId);
        $pdo = Database::get();

        $stmt = $pdo->prepare('SELECT * FROM colaborador WHERE nucleoId = ? AND ativo = 1 ORDER BY nome ASC');
        $stmt->execute([$nucleoId]);
        $colaboradores = $stmt->fetchAll();

        $stmt = $pdo->prepare('SELECT * FROM alocacao WHERE nucleoId = ? AND dataFim IS NULL');
        $stmt->execute([$nucleoId]);
        $alocacoesAtivas = $stmt->fetchAll();

        $clienteIds = array_values(array_unique(array_column($alocacoesAtivas, 'clienteId')));
        $pontuacoes = Scoring::calcularPontuacoesClientes($clienteIds, $nucleoId);

        $linhas = [];
        foreach ($colaboradores as $colaborador) {
            $doColaborador = array_filter($alocacoesAtivas, fn($a) => $a['colaboradorId'] === $colaborador['id']);
            $porNivel = array_fill_keys(self::NIVEIS_CLIENTE, 0);
            $pontuacaoTotal = 0.0;
            foreach ($doColaborador as $a) {
                $p = $pontuacoes[$a['clienteId']] ?? null;
                if ($p && $p['nivel']) {
                    $porNivel[$p['nivel']]++;
                }
                $pontuacaoTotal += $p['pontuacaoTotal'] ?? 0;
            }
            $capacidade = $colaborador['capacidadeMaximaPontos'];
            $linhas[] = [
                'colaboradorId' => $colaborador['id'],
                'nome' => $colaborador['nome'],
                'nivelTecnico' => $colaborador['nivelTecnico'],
                'capacidadeMaximaPontos' => $capacidade !== null ? (float) $capacidade : null,
                'pontuacaoTotal' => $pontuacaoTotal,
                'cargaRelativa' => $capacidade ? $pontuacaoTotal / (float) $capacidade : null,
                'clientesPorNivel' => $porNivel,
                'totalClientes' => count($doColaborador),
            ];
        }

        Http::json(['niveis' => self::NIVEIS_CLIENTE, 'linhas' => $linhas]);
    }
}
