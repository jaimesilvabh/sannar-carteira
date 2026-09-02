<?php

namespace Sannar\Controllers;

use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;
use Sannar\HttpException;
use Sannar\Rbac;
use Sannar\Services\PdfHelpers;
use Sannar\Services\Scoring;

class RelatoriosController
{
    private const NIVEIS_CLIENTE = ['N1', 'N2', 'N3', 'N4'];
    private const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    // -------------------------------------------------------------------
    // Coleta de dados
    // -------------------------------------------------------------------

    private static function dadosRelatorioColaborador(string $colaboradorId, int $ano): array
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT c.*, n.nome AS nucleoNome FROM colaborador c INNER JOIN nucleo n ON n.id=c.nucleoId WHERE c.id=?');
        $stmt->execute([$colaboradorId]);
        $colaborador = $stmt->fetch();
        if (!$colaborador) throw new HttpException(404, 'Colaborador não encontrado');

        $stmt = $pdo->prepare('SELECT a.*, cl.nome AS clienteNome FROM alocacao a INNER JOIN cliente cl ON cl.id=a.clienteId WHERE a.colaboradorId=? AND a.nucleoId=? AND a.dataFim IS NULL');
        $stmt->execute([$colaboradorId, $colaborador['nucleoId']]);
        $alocacoes = $stmt->fetchAll();
        $clienteIds = array_column($alocacoes, 'clienteId');
        $pontuacoes = Scoring::calcularPontuacoesClientes($clienteIds, $colaborador['nucleoId']);
        $tiposPorCliente = ClientesController::buscarTiposPorCliente($clienteIds, $colaborador['nucleoId']);

        $clientesPorNivel = array_fill_keys(self::NIVEIS_CLIENTE, 0);
        $pontuacaoTotal = 0.0;
        $naoAvaliados = 0;
        $carteira = [];
        foreach ($alocacoes as $a) {
            $p = $pontuacoes[$a['clienteId']] ?? null;
            if ($p && $p['nivel']) { $clientesPorNivel[$p['nivel']]++; $pontuacaoTotal += $p['pontuacaoTotal']; }
            else { $naoAvaliados++; }
            $tipos = implode(', ', array_map(fn($t) => $t['nome'], $tiposPorCliente[$a['clienteId']] ?? []));
            $carteira[] = ['nome' => $a['clienteNome'], 'tipos' => $tipos, 'nivel' => $p['nivel'] ?? 'Não avaliado', 'pontuacao' => $p['pontuacaoTotal'] ?? 0];
        }
        usort($carteira, fn($x, $y) => strcmp($x['nome'], $y['nome']));

        $stmt = $pdo->prepare('SELECT * FROM timesheetmensal WHERE colaboradorId=? AND ano=? AND ativo=1');
        $stmt->execute([$colaboradorId, $ano]);
        $timesheets = $stmt->fetchAll();
        $produtividadeMensal = [];
        for ($m = 1; $m <= 12; $m++) {
            $t = null;
            foreach ($timesheets as $x) { if ((int) $x['mes'] === $m) { $t = $x; break; } }
            $produtividadeMensal[] = ['mes' => self::MESES_ABREV[$m - 1], 'eficiencia' => $t ? (float) $t['eficiencia'] : null];
        }
        $comDado = array_filter($timesheets, fn($t) => $t['eficiencia'] !== null);
        $produtividadeMedia = count($comDado) > 0 ? array_sum(array_map(fn($t) => (float) $t['eficiencia'], $comDado)) / count($comDado) : null;

        $capacidade = $colaborador['capacidadeMaximaPontos'] !== null ? (float) $colaborador['capacidadeMaximaPontos'] : null;

        return [
            'colaborador' => $colaborador, 'totalClientes' => count($clienteIds), 'naoAvaliados' => $naoAvaliados,
            'clientesPorNivel' => $clientesPorNivel, 'pontuacaoTotal' => $pontuacaoTotal,
            'custoPorPonto' => $pontuacaoTotal > 0 ? (float) $colaborador['remuneracaoTotal'] / $pontuacaoTotal : null,
            'cargaRelativa' => $capacidade ? $pontuacaoTotal / $capacidade : null,
            'carteira' => $carteira, 'produtividadeMensal' => $produtividadeMensal, 'produtividadeMedia' => $produtividadeMedia, 'ano' => $ano,
        ];
    }

    private static function dadosRelatorioNucleo(string $nucleoId, int $ano): array
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM nucleo WHERE id=?');
        $stmt->execute([$nucleoId]);
        $nucleo = $stmt->fetch();
        if (!$nucleo) throw new HttpException(404, 'Núcleo não encontrado');

        $stmt = $pdo->prepare('SELECT * FROM colaborador WHERE nucleoId=? AND ativo=1 ORDER BY nome ASC');
        $stmt->execute([$nucleoId]);
        $colaboradores = $stmt->fetchAll();

        $linhas = [];
        $pontuacaoTotalNucleo = 0.0;
        $clientesTotalNucleo = 0;
        foreach ($colaboradores as $colaborador) {
            $stmt = $pdo->prepare('SELECT clienteId FROM alocacao WHERE colaboradorId=? AND nucleoId=? AND dataFim IS NULL');
            $stmt->execute([$colaborador['id'], $nucleoId]);
            $clienteIds = $stmt->fetchAll(\PDO::FETCH_COLUMN);
            $pontuacoes = Scoring::calcularPontuacoesClientes($clienteIds, $nucleoId);
            $pontuacaoTotal = array_sum(array_map(fn($p) => $p['pontuacaoTotal'], $pontuacoes));

            $stmt = $pdo->prepare('SELECT * FROM timesheetmensal WHERE colaboradorId=? AND ano=? AND ativo=1');
            $stmt->execute([$colaborador['id'], $ano]);
            $timesheets = $stmt->fetchAll();
            $eficienciaMedia = count($timesheets) > 0 ? array_sum(array_map(fn($t) => (float) $t['eficiencia'], $timesheets)) / count($timesheets) : null;

            $pontuacaoTotalNucleo += $pontuacaoTotal;
            $clientesTotalNucleo += count($clienteIds);
            $capacidade = $colaborador['capacidadeMaximaPontos'] !== null ? (float) $colaborador['capacidadeMaximaPontos'] : null;
            $linhas[] = [
                'colaborador' => $colaborador['nome'], 'nivelTecnico' => $colaborador['nivelTecnico'], 'totalClientes' => count($clienteIds),
                'pontuacaoTotal' => $pontuacaoTotal, 'capacidadeMaximaPontos' => $capacidade,
                'cargaRelativa' => $capacidade ? $pontuacaoTotal / $capacidade : null, 'eficienciaMedia' => $eficienciaMedia,
            ];
        }

        return ['nucleo' => $nucleo, 'ano' => $ano, 'colaboradoresAtivos' => count($colaboradores), 'clientesTotalNucleo' => $clientesTotalNucleo, 'pontuacaoTotalNucleo' => $pontuacaoTotalNucleo, 'linhas' => $linhas];
    }

    private static function dadosRelatorioCustos(string $nucleoId): array
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM nucleo WHERE id=?');
        $stmt->execute([$nucleoId]);
        $nucleo = $stmt->fetch();
        if (!$nucleo) throw new HttpException(404, 'Núcleo não encontrado');

        $stmt = $pdo->prepare('SELECT * FROM colaborador WHERE nucleoId=? AND ativo=1 ORDER BY nome ASC');
        $stmt->execute([$nucleoId]);
        $colaboradores = $stmt->fetchAll();

        $linhas = [];
        foreach ($colaboradores as $colaborador) {
            $stmt = $pdo->prepare('SELECT clienteId FROM alocacao WHERE colaboradorId=? AND nucleoId=? AND dataFim IS NULL');
            $stmt->execute([$colaborador['id'], $nucleoId]);
            $clienteIds = $stmt->fetchAll(\PDO::FETCH_COLUMN);
            $pontuacoes = Scoring::calcularPontuacoesClientes($clienteIds, $nucleoId);
            $pontuacaoTotal = array_sum(array_map(fn($p) => $p['pontuacaoTotal'], $pontuacoes));
            $linhas[] = [
                'colaborador' => $colaborador['nome'], 'remuneracaoTotal' => (float) $colaborador['remuneracaoTotal'],
                'pontuacaoTotal' => $pontuacaoTotal, 'custoPorPonto' => $pontuacaoTotal > 0 ? (float) $colaborador['remuneracaoTotal'] / $pontuacaoTotal : null,
                'totalClientes' => count($clienteIds),
            ];
        }
        $validos = array_values(array_filter($linhas, fn($l) => $l['custoPorPonto'] !== null));
        $mediaCustoPorPonto = count($validos) > 0 ? array_sum(array_map(fn($l) => $l['custoPorPonto'], $validos)) / count($validos) : null;
        $remuneracaoTotalNucleo = array_sum(array_map(fn($l) => $l['remuneracaoTotal'], $linhas));

        return ['nucleo' => $nucleo, 'linhas' => $linhas, 'mediaCustoPorPonto' => $mediaCustoPorPonto, 'remuneracaoTotalNucleo' => $remuneracaoTotalNucleo];
    }

    private static function dadosClientesPorTipo(string $nucleoId): array
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM nucleo WHERE id=?');
        $stmt->execute([$nucleoId]);
        $nucleo = $stmt->fetch();
        if (!$nucleo) throw new HttpException(404, 'Núcleo não encontrado');

        $stmt = $pdo->prepare('SELECT * FROM tipocliente WHERE nucleoId=? AND ativo=1 ORDER BY nome ASC');
        $stmt->execute([$nucleoId]);
        $tipos = $stmt->fetchAll();

        $grupos = [];
        foreach ($tipos as $tipo) {
            $stmt = $pdo->prepare('SELECT cl.nome FROM clientetipo ct INNER JOIN cliente cl ON cl.id=ct.clienteId WHERE ct.tipoClienteId=? AND cl.ativo=1 ORDER BY cl.nome ASC');
            $stmt->execute([$tipo['id']]);
            $nomes = $stmt->fetchAll(\PDO::FETCH_COLUMN);
            $grupos[] = ['tipo' => $tipo['nome'], 'quantidade' => count($nomes), 'clientes' => $nomes];
        }

        $stmt = $pdo->prepare('SELECT COUNT(DISTINCT cn.clienteId) FROM clientenucleo cn INNER JOIN cliente c ON c.id=cn.clienteId
            WHERE cn.nucleoId=? AND c.ativo=1 AND cn.clienteId NOT IN (SELECT clienteId FROM clientetipo WHERE nucleoId=?)');
        $stmt->execute([$nucleoId, $nucleoId]);
        $semTipo = (int) $stmt->fetchColumn();

        return ['nucleo' => $nucleo, 'grupos' => $grupos, 'semTipo' => $semTipo];
    }

    // -------------------------------------------------------------------
    // Endpoints JSON
    // -------------------------------------------------------------------

    public static function colaboradorJson(array $params): void
    {
        Auth::requireAuth();
        $stmt = Database::get()->prepare('SELECT nucleoId FROM colaborador WHERE id=?');
        $stmt->execute([$params['id']]);
        $nucleoId = $stmt->fetchColumn();
        if (!$nucleoId) throw new HttpException(404, 'Colaborador não encontrado');
        Rbac::assertNucleoAccess($nucleoId);
        $ano = Http::query('ano') ? (int) Http::query('ano') : (int) date('Y');
        Http::json(self::dadosRelatorioColaborador($params['id'], $ano));
    }

    public static function desempenhoJson(array $params): void
    {
        Auth::requireAuth();
        Rbac::assertNucleoAccess($params['nucleoId']);
        $ano = Http::query('ano') ? (int) Http::query('ano') : (int) date('Y');
        Http::json(self::dadosRelatorioNucleo($params['nucleoId'], $ano));
    }

    public static function custosJson(array $params): void
    {
        Auth::requireAuth();
        Rbac::assertNucleoAccess($params['nucleoId']);
        Http::json(self::dadosRelatorioCustos($params['nucleoId']));
    }

    public static function clientesPorTipoJson(array $params): void
    {
        Auth::requireAuth();
        Rbac::assertNucleoAccess($params['nucleoId']);
        Http::json(self::dadosClientesPorTipo($params['nucleoId']));
    }

    // -------------------------------------------------------------------
    // Endpoints PDF
    // -------------------------------------------------------------------

    private static function enviarPdf(\TCPDF $pdf, string $nomeArquivo): void
    {
        header('Content-Type: application/pdf');
        header("Content-Disposition: attachment; filename=\"{$nomeArquivo}\"");
        echo $pdf->Output($nomeArquivo, 'S');
    }

    public static function colaboradorPdf(array $params): void
    {
        Auth::requireAuth();
        $stmt = Database::get()->prepare('SELECT nucleoId FROM colaborador WHERE id=?');
        $stmt->execute([$params['id']]);
        $nucleoId = $stmt->fetchColumn();
        if (!$nucleoId) throw new HttpException(404, 'Colaborador não encontrado');
        Rbac::assertNucleoAccess($nucleoId);
        $ano = Http::query('ano') ? (int) Http::query('ano') : (int) date('Y');
        $d = self::dadosRelatorioColaborador($params['id'], $ano);

        $pdf = PdfHelpers::novoDocumento("Relatório - {$d['colaborador']['nome']}");
        PdfHelpers::cabecalho($pdf, "Relatório do Colaborador — {$d['colaborador']['nome']}", "Núcleo {$d['colaborador']['nucleoNome']} · Nível técnico {$d['colaborador']['nivelTecnico']} · Ano {$ano}");

        PdfHelpers::tituloSecao($pdf, 'Resultados');
        PdfHelpers::kpiLinha($pdf, [
            ['Total de clientes:', (string) $d['totalClientes']],
            ['Não avaliados:', (string) $d['naoAvaliados']],
            ['Pontuação da carteira:', number_format($d['pontuacaoTotal'], 1, ',', '.')],
            ['Capacidade máxima:', $d['colaborador']['capacidadeMaximaPontos'] !== null ? (string) $d['colaborador']['capacidadeMaximaPontos'] : 'não definida'],
            ['Carga relativa:', $d['cargaRelativa'] !== null ? round($d['cargaRelativa'] * 100) . '%' : '—'],
            ['Custo por ponto:', $d['custoPorPonto'] !== null ? self::moeda($d['custoPorPonto']) : '—'],
            ['Produtividade média no ano:', $d['produtividadeMedia'] !== null ? number_format($d['produtividadeMedia'], 1, ',', '.') . '%' : 'sem lançamentos'],
        ]);

        PdfHelpers::tituloSecao($pdf, 'Clientes por nível');
        PdfHelpers::tabela($pdf,
            [['titulo' => 'Nível', 'largura' => 40, 'quebraLinha' => false], ['titulo' => 'Quantidade', 'largura' => 40, 'quebraLinha' => false]],
            array_map(fn($n) => [$n, (string) $d['clientesPorNivel'][$n]], self::NIVEIS_CLIENTE)
        );

        PdfHelpers::tituloSecao($pdf, 'Relação analítica da carteira');
        PdfHelpers::tabela($pdf,
            [['titulo' => 'Cliente', 'largura' => 80], ['titulo' => 'Tipo', 'largura' => 50], ['titulo' => 'Nível', 'largura' => 25, 'quebraLinha' => false], ['titulo' => 'Pontuação', 'largura' => 25, 'quebraLinha' => false]],
            array_map(fn($c) => [$c['nome'], $c['tipos'] ?: '—', $c['nivel'], number_format($c['pontuacao'], 1, ',', '.')], $d['carteira'])
        );

        PdfHelpers::tituloSecao($pdf, 'Produtividade mensal');
        PdfHelpers::tabela($pdf,
            [['titulo' => 'Mês', 'largura' => 40, 'quebraLinha' => false], ['titulo' => 'Eficiência (%)', 'largura' => 40, 'quebraLinha' => false]],
            array_map(fn($p) => [$p['mes'], $p['eficiencia'] !== null ? number_format($p['eficiencia'], 1, ',', '.') : '—'], $d['produtividadeMensal'])
        );

        self::enviarPdf($pdf, 'relatorio-' . self::slug($d['colaborador']['nome']) . '.pdf');
    }

    public static function desempenhoPdf(array $params): void
    {
        Auth::requireAuth();
        Rbac::assertNucleoAccess($params['nucleoId']);
        $ano = Http::query('ano') ? (int) Http::query('ano') : (int) date('Y');
        $d = self::dadosRelatorioNucleo($params['nucleoId'], $ano);

        $pdf = PdfHelpers::novoDocumento("Desempenho - {$d['nucleo']['nome']}");
        PdfHelpers::cabecalho($pdf, "Desempenho Geral da Carteira — {$d['nucleo']['nome']}", "Ano {$ano}");
        PdfHelpers::kpiLinha($pdf, [
            ['Colaboradores ativos:', (string) $d['colaboradoresAtivos']],
            ['Clientes atendidos:', (string) $d['clientesTotalNucleo']],
            ['Pontuação total do núcleo:', number_format($d['pontuacaoTotalNucleo'], 1, ',', '.')],
        ]);

        PdfHelpers::tituloSecao($pdf, 'Desempenho por colaborador');
        PdfHelpers::tabela($pdf,
            [
                ['titulo' => 'Colaborador', 'largura' => 45],
                ['titulo' => 'Nível', 'largura' => 15, 'quebraLinha' => false],
                ['titulo' => 'Clientes', 'largura' => 20, 'quebraLinha' => false],
                ['titulo' => 'Pontuação', 'largura' => 25, 'quebraLinha' => false],
                ['titulo' => 'Capacidade', 'largura' => 25, 'quebraLinha' => false],
                ['titulo' => 'Carga', 'largura' => 20, 'quebraLinha' => false],
                ['titulo' => 'Eficiência média', 'largura' => 30, 'quebraLinha' => false],
            ],
            array_map(fn($l) => [
                $l['colaborador'], $l['nivelTecnico'], (string) $l['totalClientes'], number_format($l['pontuacaoTotal'], 1, ',', '.'),
                $l['capacidadeMaximaPontos'] !== null ? (string) $l['capacidadeMaximaPontos'] : '—',
                $l['cargaRelativa'] !== null ? round($l['cargaRelativa'] * 100) . '%' : '—',
                $l['eficienciaMedia'] !== null ? number_format($l['eficienciaMedia'], 1, ',', '.') . '%' : '—',
            ], $d['linhas'])
        );

        self::enviarPdf($pdf, 'desempenho-' . self::slug($d['nucleo']['nome']) . '.pdf');
    }

    public static function custosPdf(array $params): void
    {
        Auth::requireAuth();
        Rbac::assertNucleoAccess($params['nucleoId']);
        $d = self::dadosRelatorioCustos($params['nucleoId']);

        $pdf = PdfHelpers::novoDocumento("Custos - {$d['nucleo']['nome']}");
        PdfHelpers::cabecalho($pdf, "Custo Consolidado por Colaborador — {$d['nucleo']['nome']}");
        PdfHelpers::kpiLinha($pdf, [
            ['Remuneração total do núcleo:', self::moeda($d['remuneracaoTotalNucleo'])],
            ['Custo médio por ponto:', $d['mediaCustoPorPonto'] !== null ? self::moeda($d['mediaCustoPorPonto']) : '—'],
        ]);

        PdfHelpers::tituloSecao($pdf, 'Análise por colaborador');
        PdfHelpers::tabela($pdf,
            [
                ['titulo' => 'Colaborador', 'largura' => 55],
                ['titulo' => 'Remuneração total', 'largura' => 40, 'quebraLinha' => false],
                ['titulo' => 'Clientes', 'largura' => 20, 'quebraLinha' => false],
                ['titulo' => 'Pontuação carteira', 'largura' => 35, 'quebraLinha' => false],
                ['titulo' => 'Custo por ponto', 'largura' => 30, 'quebraLinha' => false],
            ],
            array_map(fn($l) => [
                $l['colaborador'], self::moeda($l['remuneracaoTotal']), (string) $l['totalClientes'],
                number_format($l['pontuacaoTotal'], 1, ',', '.'), $l['custoPorPonto'] !== null ? self::moeda($l['custoPorPonto']) : '—',
            ], $d['linhas'])
        );

        self::enviarPdf($pdf, 'custos-' . self::slug($d['nucleo']['nome']) . '.pdf');
    }

    public static function clientesPorTipoPdf(array $params): void
    {
        Auth::requireAuth();
        Rbac::assertNucleoAccess($params['nucleoId']);
        $d = self::dadosClientesPorTipo($params['nucleoId']);

        $pdf = PdfHelpers::novoDocumento("Clientes por tipo - {$d['nucleo']['nome']}");
        PdfHelpers::cabecalho($pdf, "Clientes por Tipo — {$d['nucleo']['nome']}");

        PdfHelpers::tituloSecao($pdf, 'Resumo');
        $resumo = array_map(fn($g) => [$g['tipo'], (string) $g['quantidade']], $d['grupos']);
        $resumo[] = ['Sem tipo definido', (string) $d['semTipo']];
        PdfHelpers::tabela($pdf, [['titulo' => 'Tipo', 'largura' => 100], ['titulo' => 'Quantidade', 'largura' => 40, 'quebraLinha' => false]], $resumo);

        foreach ($d['grupos'] as $g) {
            if ($g['quantidade'] === 0) continue;
            PdfHelpers::tituloSecao($pdf, "{$g['tipo']} ({$g['quantidade']})");
            PdfHelpers::tabela($pdf, [['titulo' => 'Cliente', 'largura' => 170]], array_map(fn($c) => [$c], $g['clientes']));
        }

        self::enviarPdf($pdf, 'clientes-por-tipo-' . self::slug($d['nucleo']['nome']) . '.pdf');
    }

    private static function moeda(float $v): string
    {
        return 'R$ ' . number_format($v, 2, ',', '.');
    }

    private static function slug(string $s): string
    {
        $s = \Normalizer::normalize($s, \Normalizer::FORM_D);
        $s = preg_replace('/[\x{0300}-\x{036f}]/u', '', $s);
        $s = mb_strtolower($s);
        $s = preg_replace('/[^a-z0-9]+/', '-', $s);
        return trim($s, '-');
    }
}
