<?php

namespace Sannar\Services;

use Sannar\Database;

class Alerts
{
    private const MESES_CONSECUTIVOS_SOBRECARGA = 2;
    private const MESES_TENDENCIA_EFICIENCIA = 3;
    private const MULTIPLICADOR_CUSTO_ALTO = 1.5;
    private const NIVEIS_CLIENTE = ['N1', 'N2', 'N3', 'N4'];

    private static function nivelRank(string $nivel): int
    {
        return array_search($nivel, self::NIVEIS_CLIENTE, true);
    }

    /** Gera todas as sinalizações estratégicas (seção 10). Cada alerta carrega o dado bruto que o sustenta. */
    public static function gerarAlertas(?string $nucleoIdFiltro = null): array
    {
        $pdo = Database::get();
        $alertas = [];

        if ($nucleoIdFiltro) {
            $stmt = $pdo->prepare('SELECT * FROM colaborador WHERE ativo = 1 AND nucleoId = ?');
            $stmt->execute([$nucleoIdFiltro]);
        } else {
            $stmt = $pdo->query('SELECT * FROM colaborador WHERE ativo = 1');
        }
        $colaboradores = $stmt->fetchAll();

        $mesesRecentes = self::ultimosMeses(max(self::MESES_CONSECUTIVOS_SOBRECARGA, self::MESES_TENDENCIA_EFICIENCIA) + 1);

        foreach ($colaboradores as $colaborador) {
            // 1. Sobrecarga: pontuação acima da capacidade máxima por N meses seguidos.
            if ($colaborador['capacidadeMaximaPontos']) {
                $bloco = array_slice($mesesRecentes, 0, self::MESES_CONSECUTIVOS_SOBRECARGA);
                $snapshots = [];
                foreach ($bloco as $m) {
                    $stmt = $pdo->prepare('SELECT * FROM carteirasnapshotmensal WHERE colaboradorId=? AND mes=? AND ano=?');
                    $stmt->execute([$colaborador['id'], $m['mes'], $m['ano']]);
                    $s = $stmt->fetch();
                    if ($s) $snapshots[] = $s;
                }
                $consecutivos = count($snapshots) === count($bloco) && array_reduce($bloco, function ($ok, $m) use ($snapshots, $colaborador) {
                    foreach ($snapshots as $s) {
                        if ($s['mes'] == $m['mes'] && $s['ano'] == $m['ano']) {
                            return $ok && (float) $s['pontuacaoTotal'] > (float) $colaborador['capacidadeMaximaPontos'];
                        }
                    }
                    return false;
                }, true);
                if ($consecutivos) {
                    $alertas[] = [
                        'tipo' => 'SOBRECARGA', 'severidade' => 'ALTA',
                        'titulo' => "{$colaborador['nome']} está acima da capacidade máxima há " . self::MESES_CONSECUTIVOS_SOBRECARGA . ' meses',
                        'nucleoId' => $colaborador['nucleoId'], 'colaboradorId' => $colaborador['id'],
                        'dadosBrutos' => ['capacidadeMaximaPontos' => (float) $colaborador['capacidadeMaximaPontos'], 'snapshots' => $snapshots],
                    ];
                }
            }

            // 2. Eficiência em queda: tendência negativa nos últimos 3 meses.
            $blocoEf = array_slice($mesesRecentes, 0, self::MESES_TENDENCIA_EFICIENCIA);
            $serie = [];
            foreach (array_reverse($blocoEf) as $m) {
                $stmt = $pdo->prepare('SELECT * FROM timesheetmensal WHERE colaboradorId=? AND mes=? AND ano=? AND ativo=1');
                $stmt->execute([$colaborador['id'], $m['mes'], $m['ano']]);
                $t = $stmt->fetch();
                if ($t) $serie[] = (float) $t['eficiencia'];
            }
            if (count($serie) === self::MESES_TENDENCIA_EFICIENCIA && self::ehQuedaConsistente($serie)) {
                $alertas[] = [
                    'tipo' => 'EFICIENCIA_EM_QUEDA', 'severidade' => 'MEDIA',
                    'titulo' => "Eficiência de {$colaborador['nome']} em queda nos últimos " . self::MESES_TENDENCIA_EFICIENCIA . ' meses',
                    'nucleoId' => $colaborador['nucleoId'], 'colaboradorId' => $colaborador['id'],
                    'dadosBrutos' => ['serieEficiencia' => $serie],
                ];
            }
        }

        $nucleoIds = array_values(array_unique(array_column($colaboradores, 'nucleoId')));
        foreach ($nucleoIds as $nucleoId) {
            $colaboradoresDoNucleo = array_values(array_filter($colaboradores, fn($c) => $c['nucleoId'] === $nucleoId));
            $capacidadeInstalada = array_sum(array_map(fn($c) => (float) ($c['capacidadeMaximaPontos'] ?? 0), $colaboradoresDoNucleo));
            $mesAtual = $mesesRecentes[0];
            $mesAnterior = $mesesRecentes[self::MESES_CONSECUTIVOS_SOBRECARGA] ?? $mesesRecentes[1];
            $colabIds = array_column($colaboradoresDoNucleo, 'id');

            $snapAtual = self::snapshotsDoMes($colabIds, $mesAtual);
            $snapAnterior = self::snapshotsDoMes($colabIds, $mesAnterior);
            $totalAtual = array_sum(array_map(fn($s) => (float) $s['pontuacaoTotal'], $snapAtual));
            $totalAnterior = array_sum(array_map(fn($s) => (float) $s['pontuacaoTotal'], $snapAnterior));

            if ($totalAnterior > 0 && $capacidadeInstalada > 0) {
                $crescimento = ($totalAtual - $totalAnterior) / $totalAnterior;
                if ($crescimento > 0 && $totalAtual > $capacidadeInstalada * 0.9) {
                    $alertas[] = [
                        'tipo' => 'NECESSIDADE_CONTRATACAO', 'severidade' => 'ALTA',
                        'titulo' => 'Núcleo está próximo/acima da capacidade instalada e crescendo',
                        'nucleoId' => $nucleoId,
                        'dadosBrutos' => ['totalAtual' => $totalAtual, 'totalAnterior' => $totalAnterior, 'capacidadeInstalada' => $capacidadeInstalada, 'crescimentoCarteira' => $crescimento],
                    ];
                }
            }

            // 4. Oportunidade de redistribuição.
            $cargas = [];
            foreach ($colaboradoresDoNucleo as $c) {
                $snap = null;
                foreach ($snapAtual as $s) { if ($s['colaboradorId'] === $c['id']) { $snap = $s; break; } }
                $carga = $c['capacidadeMaximaPontos'] && $snap ? (float) $snap['pontuacaoTotal'] / (float) $c['capacidadeMaximaPontos'] : null;
                $stmt = $pdo->prepare('SELECT * FROM timesheetmensal WHERE colaboradorId=? AND mes=? AND ano=? AND ativo=1');
                $stmt->execute([$c['id'], $mesAtual['mes'], $mesAtual['ano']]);
                $ts = $stmt->fetch();
                $cargas[] = ['colaborador' => $c, 'carga' => $carga, 'eficiencia' => $ts ? (float) $ts['eficiencia'] : null];
            }
            $sobrecarregados = array_filter($cargas, fn($c) => $c['carga'] !== null && $c['carga'] > 1);
            $comFolga = array_filter($cargas, fn($c) => $c['carga'] !== null && $c['carga'] < 0.7 && $c['eficiencia'] !== null && $c['eficiencia'] >= 80);
            foreach ($sobrecarregados as $sobrecarregado) {
                foreach ($comFolga as $folgado) {
                    $alertas[] = [
                        'tipo' => 'OPORTUNIDADE_REDISTRIBUICAO', 'severidade' => 'BAIXA',
                        'titulo' => "{$folgado['colaborador']['nome']} tem folga e boa eficiência — pode receber clientes de {$sobrecarregado['colaborador']['nome']}",
                        'nucleoId' => $nucleoId, 'colaboradorId' => $folgado['colaborador']['id'],
                        'dadosBrutos' => [
                            'colaboradorSobrecarregado' => $sobrecarregado['colaborador']['nome'], 'cargaSobrecarregado' => $sobrecarregado['carga'],
                            'colaboradorComFolga' => $folgado['colaborador']['nome'], 'cargaComFolga' => $folgado['carga'], 'eficienciaComFolga' => $folgado['eficiencia'],
                        ],
                    ];
                }
            }
        }

        // 5. Alocação incompatível.
        if ($nucleoIdFiltro) {
            $stmt = $pdo->prepare('SELECT a.*, c.nome AS clienteNome, col.nome AS colaboradorNome, col.nivelTecnico, col.excecaoNivelClienteMax
                FROM alocacao a INNER JOIN cliente c ON c.id=a.clienteId INNER JOIN colaborador col ON col.id=a.colaboradorId
                WHERE a.dataFim IS NULL AND a.nucleoId = ?');
            $stmt->execute([$nucleoIdFiltro]);
        } else {
            $stmt = $pdo->query('SELECT a.*, c.nome AS clienteNome, col.nome AS colaboradorNome, col.nivelTecnico, col.excecaoNivelClienteMax
                FROM alocacao a INNER JOIN cliente c ON c.id=a.clienteId INNER JOIN colaborador col ON col.id=a.colaboradorId
                WHERE a.dataFim IS NULL');
        }
        $alocacoesAtivas = $stmt->fetchAll();

        if ($nucleoIdFiltro) {
            $stmt = $pdo->prepare('SELECT * FROM regracorrespondencia WHERE nucleoId = ?');
            $stmt->execute([$nucleoIdFiltro]);
        } else {
            $stmt = $pdo->query('SELECT * FROM regracorrespondencia');
        }
        $regras = $stmt->fetchAll();
        $regraMap = [];
        foreach ($regras as $r) {
            $regraMap["{$r['nucleoId']}|{$r['nivelTecnico']}"] = $r['nivelClienteMaximo'];
        }

        $porNucleo = [];
        foreach ($alocacoesAtivas as $a) {
            $porNucleo[$a['nucleoId']][] = $a['clienteId'];
        }
        foreach ($porNucleo as $nucleoId => $clienteIds) {
            $pontuacoes = Scoring::calcularPontuacoesClientes(array_values(array_unique($clienteIds)), $nucleoId);
            foreach (array_filter($alocacoesAtivas, fn($x) => $x['nucleoId'] === $nucleoId) as $a) {
                $nivelCliente = $pontuacoes[$a['clienteId']]['nivel'] ?? null;
                if (!$nivelCliente) continue;
                $maxPermitido = $a['excecaoNivelClienteMax'] ?: ($regraMap["{$nucleoId}|{$a['nivelTecnico']}"] ?? null);
                if ($maxPermitido && self::nivelRank($nivelCliente) > self::nivelRank($maxPermitido)) {
                    $alertas[] = [
                        'tipo' => 'ALOCACAO_INCOMPATIVEL', 'severidade' => 'ALTA',
                        'titulo' => "{$a['clienteNome']} (nível {$nivelCliente}) está com {$a['colaboradorNome']}, que atende até {$maxPermitido}",
                        'nucleoId' => $nucleoId, 'colaboradorId' => $a['colaboradorId'], 'clienteId' => $a['clienteId'],
                        'dadosBrutos' => ['nivelCliente' => $nivelCliente, 'nivelMaximoColaborador' => $maxPermitido, 'nivelTecnico' => $a['nivelTecnico']],
                    ];
                }
            }
        }

        // 6. Custo por ponto muito acima da média do núcleo.
        foreach ($nucleoIds as $nucleoId) {
            $colaboradoresDoNucleo = array_values(array_filter($colaboradores, fn($c) => $c['nucleoId'] === $nucleoId));
            $custos = [];
            foreach ($colaboradoresDoNucleo as $c) {
                $stmt = $pdo->prepare('SELECT clienteId FROM alocacao WHERE colaboradorId=? AND nucleoId=? AND dataFim IS NULL');
                $stmt->execute([$c['id'], $nucleoId]);
                $clienteIds = $stmt->fetchAll(\PDO::FETCH_COLUMN);
                $pontuacoes = Scoring::calcularPontuacoesClientes($clienteIds, $nucleoId);
                $total = array_sum(array_map(fn($p) => $p['pontuacaoTotal'], $pontuacoes));
                $custos[] = ['colaborador' => $c, 'custoPorPonto' => $total > 0 ? (float) $c['remuneracaoTotal'] / $total : null];
            }
            $validos = array_values(array_filter($custos, fn($c) => $c['custoPorPonto'] !== null));
            if (count($validos) === 0) continue;
            $media = array_sum(array_map(fn($c) => $c['custoPorPonto'], $validos)) / count($validos);
            foreach ($validos as $c) {
                if ($c['custoPorPonto'] > $media * self::MULTIPLICADOR_CUSTO_ALTO) {
                    $alertas[] = [
                        'tipo' => 'CUSTO_POR_PONTO_ALTO', 'severidade' => 'MEDIA',
                        'titulo' => "Custo por ponto de {$c['colaborador']['nome']} está bem acima da média do núcleo",
                        'nucleoId' => $nucleoId, 'colaboradorId' => $c['colaborador']['id'],
                        'dadosBrutos' => ['custoPorPonto' => $c['custoPorPonto'], 'mediaNucleo' => $media, 'multiplicador' => self::MULTIPLICADOR_CUSTO_ALTO],
                    ];
                }
            }
        }

        return $alertas;
    }

    private static function snapshotsDoMes(array $colaboradorIds, array $mes): array
    {
        if (count($colaboradorIds) === 0) return [];
        $pdo = Database::get();
        $ph = implode(',', array_fill(0, count($colaboradorIds), '?'));
        $stmt = $pdo->prepare("SELECT * FROM carteirasnapshotmensal WHERE colaboradorId IN ($ph) AND mes=? AND ano=?");
        $stmt->execute([...$colaboradorIds, $mes['mes'], $mes['ano']]);
        return $stmt->fetchAll();
    }

    private static function ultimosMeses(int $quantidade): array
    {
        $out = [];
        $mes = (int) date('n');
        $ano = (int) date('Y');
        for ($i = 0; $i < $quantidade; $i++) {
            $out[] = ['mes' => $mes, 'ano' => $ano];
            $mes--;
            if ($mes === 0) { $mes = 12; $ano--; }
        }
        return $out;
    }

    private static function ehQuedaConsistente(array $serie): bool
    {
        for ($i = 1; $i < count($serie); $i++) {
            if ($serie[$i] >= $serie[$i - 1]) return false;
        }
        return true;
    }
}
