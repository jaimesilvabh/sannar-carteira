<?php

namespace Sannar\Controllers;

use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;
use Sannar\HttpException;
use Sannar\Rbac;
use Sannar\Services\Scoring;

class DashboardColaboradorController
{
    private const NIVEIS_CLIENTE = ['N1', 'N2', 'N3', 'N4'];

    public static function get(array $params): void
    {
        Auth::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT c.*, n.nome AS nucleoNome FROM colaborador c INNER JOIN nucleo n ON n.id = c.nucleoId WHERE c.id = ?');
        $stmt->execute([$params['id']]);
        $colaborador = $stmt->fetch();
        if (!$colaborador) {
            throw new HttpException(404, 'Colaborador não encontrado');
        }
        Rbac::assertNucleoAccess($colaborador['nucleoId']);
        $ano = Http::query('ano') ? (int) Http::query('ano') : (int) date('Y');

        $stmt = $pdo->prepare('SELECT * FROM alocacao WHERE colaboradorId=? AND nucleoId=? AND dataFim IS NULL');
        $stmt->execute([$colaborador['id'], $colaborador['nucleoId']]);
        $alocacoesAtivas = $stmt->fetchAll();
        $clienteIds = array_column($alocacoesAtivas, 'clienteId');

        $stmt = $pdo->prepare('SELECT COUNT(DISTINCT cn.clienteId) FROM clientenucleo cn INNER JOIN cliente c ON c.id=cn.clienteId WHERE cn.nucleoId=? AND c.ativo=1');
        $stmt->execute([$colaborador['nucleoId']]);
        $totalClientesNucleo = (int) $stmt->fetchColumn();

        $stmt = $pdo->query('SELECT COUNT(DISTINCT cn.clienteId) FROM clientenucleo cn INNER JOIN cliente c ON c.id=cn.clienteId WHERE c.ativo=1');
        $totalClientesEmpresa = (int) $stmt->fetchColumn();

        $stmt = $pdo->prepare('SELECT * FROM criteriocliente WHERE nucleoId=? AND ativo=1');
        $stmt->execute([$colaborador['nucleoId']]);
        $criterios = $stmt->fetchAll();

        $pontuacoes = Scoring::calcularPontuacoesClientes($clienteIds, $colaborador['nucleoId']);

        $clientesPorNivel = array_fill_keys(self::NIVEIS_CLIENTE, 0);
        $naoAvaliados = 0;
        $pontuacaoTotal = 0.0;
        foreach ($clienteIds as $cid) {
            $p = $pontuacoes[$cid] ?? null;
            if ($p && $p['nivel']) {
                $clientesPorNivel[$p['nivel']]++;
                $pontuacaoTotal += $p['pontuacaoTotal'];
            } else {
                $naoAvaliados++;
            }
        }

        $raioXPorCriterio = [];
        foreach ($criterios as $criterio) {
            $distribuicao = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
            foreach ($clienteIds as $cid) {
                $detalhe = $pontuacoes[$cid]['detalhePorCriterio'] ?? [];
                foreach ($detalhe as $d) {
                    if ($d['criterioId'] === $criterio['id'] && $d['valor']) {
                        $distribuicao[$d['valor']]++;
                    }
                }
            }
            $raioXPorCriterio[] = ['criterioId' => $criterio['id'], 'nome' => $criterio['nome'], 'distribuicao' => $distribuicao];
        }

        $stmt = $pdo->prepare('SELECT * FROM timesheetmensal WHERE colaboradorId=? AND ano=? AND ativo=1');
        $stmt->execute([$colaborador['id'], $ano]);
        $timesheets = $stmt->fetchAll();
        $heatmapEficiencia = [];
        for ($m = 1; $m <= 12; $m++) {
            $t = null;
            foreach ($timesheets as $x) { if ((int) $x['mes'] === $m) { $t = $x; break; } }
            $heatmapEficiencia[] = ['mes' => $m, 'eficiencia' => $t ? (float) $t['eficiencia'] : null];
        }
        $comDado = array_filter($timesheets, fn($t) => $t['eficiencia'] !== null);
        $produtividadeMedia = count($comDado) > 0
            ? array_sum(array_map(fn($t) => (float) $t['eficiencia'], $comDado)) / count($comDado)
            : null;

        $tiposPorCliente = ClientesController::buscarTiposPorCliente($clienteIds, $colaborador['nucleoId']);
        $stmt = $pdo->prepare('SELECT id, nome, contato FROM cliente WHERE id IN (' . (count($clienteIds) ? implode(',', array_fill(0, count($clienteIds), '?')) : "''") . ')');
        $stmt->execute($clienteIds);
        $clientesInfo = [];
        foreach ($stmt->fetchAll() as $c) { $clientesInfo[$c['id']] = $c; }

        $carteiraAnalitica = [];
        foreach ($alocacoesAtivas as $a) {
            $p = $pontuacoes[$a['clienteId']] ?? null;
            $info = $clientesInfo[$a['clienteId']] ?? ['nome' => '?', 'contato' => null];
            $tipos = array_map(fn($t) => $t['nome'], $tiposPorCliente[$a['clienteId']] ?? []);
            $carteiraAnalitica[] = [
                'clienteId' => $a['clienteId'], 'nome' => $info['nome'], 'contato' => $info['contato'], 'tipos' => $tipos,
                'nivel' => $p['nivel'] ?? null, 'pontuacaoTotal' => $p['pontuacaoTotal'] ?? 0, 'desde' => $a['dataInicio'],
            ];
        }
        usort($carteiraAnalitica, fn($a, $b) => strcmp($a['nome'], $b['nome']));

        $capacidade = $colaborador['capacidadeMaximaPontos'] !== null ? (float) $colaborador['capacidadeMaximaPontos'] : null;

        Http::json([
            'colaborador' => $colaborador,
            'totalClientes' => count($clienteIds),
            'naoAvaliados' => $naoAvaliados,
            'clientesPorNivel' => $clientesPorNivel,
            'percentualSobreNucleo' => $totalClientesNucleo > 0 ? count($clienteIds) / $totalClientesNucleo : 0,
            'percentualSobreEmpresa' => $totalClientesEmpresa > 0 ? count($clienteIds) / $totalClientesEmpresa : 0,
            'pontuacaoTotal' => $pontuacaoTotal,
            'capacidadeMaximaPontos' => $capacidade,
            'cargaRelativa' => $capacidade ? $pontuacaoTotal / $capacidade : null,
            'custoPorPonto' => $pontuacaoTotal > 0 ? (float) $colaborador['remuneracaoTotal'] / $pontuacaoTotal : null,
            'raioXPorCriterio' => $raioXPorCriterio,
            'heatmapEficiencia' => $heatmapEficiencia,
            'produtividadeMedia' => $produtividadeMedia,
            'carteiraAnalitica' => $carteiraAnalitica,
            'ano' => $ano,
        ]);
    }
}
