<?php

namespace Sannar\Services;

use PhpOffice\PhpSpreadsheet\IOFactory;
use Sannar\Database;
use Sannar\Uuid;

class ExcelImport
{
    private const ABAS_IGNORADAS = ['planilha1', 'planilha1 (2)', 'planilha1(2)'];
    private const ABA_DOMESTICAS = 'domesticas';

    private const MESES_PT = [
        'janeiro' => 1, 'jan' => 1, 'fevereiro' => 2, 'fev' => 2, 'marco' => 3, 'mar' => 3,
        'abril' => 4, 'abr' => 4, 'maio' => 5, 'mai' => 5, 'junho' => 6, 'jun' => 6,
        'julho' => 7, 'jul' => 7, 'agosto' => 8, 'ago' => 8, 'setembro' => 9, 'set' => 9,
        'outubro' => 10, 'out' => 10, 'novembro' => 11, 'nov' => 11, 'dezembro' => 12, 'dez' => 12,
    ];

    public static function importarPlanilhaPessoal(string $caminhoArquivo, string $nucleoId): array
    {
        $spreadsheet = IOFactory::load($caminhoArquivo);
        $relatorio = [
            'abasProcessadas' => [], 'abasIgnoradas' => [], 'clientesCriados' => 0, 'clientesAtualizados' => 0,
            'colaboradoresCriados' => 0, 'volumesGravados' => 0, 'alocacoesCriadas' => 0, 'avisos' => [],
        ];

        $pdo = Database::get();

        $stmt = $pdo->query('SELECT id, nome FROM cliente');
        $clienteIdPorNome = [];
        foreach ($stmt->fetchAll() as $c) { $clienteIdPorNome[self::normalizar($c['nome'])] = $c['id']; }

        $stmt = $pdo->prepare('SELECT id, nome FROM colaborador WHERE nucleoId = ?');
        $stmt->execute([$nucleoId]);
        $colaboradorIdPorNome = [];
        foreach ($stmt->fetchAll() as $c) { $colaboradorIdPorNome[self::normalizar($c['nome'])] = $c['id']; }

        $stmt = $pdo->prepare('SELECT id, nome FROM tipocliente WHERE nucleoId = ?');
        $stmt->execute([$nucleoId]);
        $tipoIdPorNome = [];
        foreach ($stmt->fetchAll() as $t) { $tipoIdPorNome[self::normalizar($t['nome'])] = $t['id']; }

        foreach ($spreadsheet->getSheetNames() as $sheetName) {
            $chaveAba = self::normalizar($sheetName);
            if (in_array($chaveAba, self::ABAS_IGNORADAS, true)) {
                $relatorio['abasIgnoradas'][] = $sheetName;
                continue;
            }

            $sheet = $spreadsheet->getSheetByName($sheetName);
            $linhas = $sheet->toArray(null, true, true, false);

            if ($chaveAba === self::ABA_DOMESTICAS) {
                self::importarAbaDomesticas($linhas, $sheetName, $nucleoId, $clienteIdPorNome, $tipoIdPorNome, $relatorio);
            } else {
                self::importarAbaColaborador($linhas, $sheetName, $nucleoId, $clienteIdPorNome, $colaboradorIdPorNome, $tipoIdPorNome, $relatorio);
            }
            $relatorio['abasProcessadas'][] = $sheetName;
        }

        return $relatorio;
    }

    private static function importarAbaColaborador(array $linhas, string $sheetName, string $nucleoId, array &$clienteIdPorNome, array &$colaboradorIdPorNome, array &$tipoIdPorNome, array &$relatorio): void
    {
        $headerRowIdx = self::encontrarLinhaCabecalho($linhas, ['nome do cliente', 'cliente']);
        if ($headerRowIdx === -1) {
            $relatorio['avisos'][] = "Aba \"{$sheetName}\": não foi possível localizar a linha de cabeçalho, aba ignorada.";
            return;
        }
        $header = array_map(fn($h) => $h === null ? '' : (string) $h, $linhas[$headerRowIdx]);
        $headerNorm = array_map([self::class, 'normalizar'], $header);

        $colNome = self::indexOfContains($headerNorm, 'nome do cliente');
        $colNivel = self::indexOfContains($headerNorm, 'niveis das empresas', 'nivel da empresa');
        $colTipo = -1;
        foreach ($headerNorm as $i => $h) { if ($h === 'tipo' || str_starts_with($h, 'tipo')) { $colTipo = $i; break; } }
        $colsResponsaveis = [];
        foreach ($headerNorm as $i => $h) { if (str_contains($h, 'responsaveis pelas empresas')) { $colsResponsaveis[] = $i; } }
        $colContato = self::indexOfContains($headerNorm, 'nome cliente - contato', 'cliente contato');

        $colunasFixas = array_merge([$colNome, $colNivel, $colTipo, $colContato], $colsResponsaveis);
        $colunasMensais = [];
        foreach ($header as $idx => $raw) {
            if (in_array($idx, $colunasFixas, true)) continue;
            $norm = $headerNorm[$idx];
            if ($norm === '') continue;
            $mes = self::extrairMes($norm);
            $ano = self::extrairAno($norm);
            $categoria = self::extrairCategoria($norm);
            if ($mes && $ano && $categoria) {
                $colunasMensais[] = ['col' => $idx, 'header' => $raw, 'mes' => $mes, 'ano' => $ano, 'categoria' => $categoria];
            } elseif (preg_match('/n[ºo°]?\s*(empregad|socio|autonomo|estagiario)/', $norm)) {
                $relatorio['avisos'][] = "Aba \"{$sheetName}\": coluna \"{$raw}\" parece um bloco mensal mas não foi reconhecida (mês/ano/categoria).";
            }
        }
        self::corrigirInconsistenciasDeBloco($colunasMensais, $sheetName, $relatorio['avisos']);

        $chaveColab = self::normalizar($sheetName);
        $colaboradorId = $colaboradorIdPorNome[$chaveColab] ?? null;
        if (!$colaboradorId) {
            $colaboradorId = Uuid::v4();
            Database::get()->prepare('INSERT INTO colaborador (id, nome, nucleoId, nivelTecnico, ativo, remuneracaoTotal) VALUES (?, ?, ?, ?, 1, 0)')
                ->execute([$colaboradorId, trim($sheetName), $nucleoId, 'T2']);
            $colaboradorIdPorNome[$chaveColab] = $colaboradorId;
            $relatorio['colaboradoresCriados']++;
            $relatorio['avisos'][] = "Colaborador \"{$sheetName}\" criado automaticamente a partir da importação (nível técnico padrão T2, ajuste em Colaboradores).";
        }

        $totalLinhas = count($linhas);
        for ($r = $headerRowIdx + 1; $r < $totalLinhas; $r++) {
            $linha = $linhas[$r];
            $nomeCliente = $colNome >= 0 ? self::valorTexto($linha[$colNome] ?? null) : null;
            if (!$nomeCliente) continue;

            $tipoRaw = $colTipo >= 0 ? self::valorTexto($linha[$colTipo] ?? null) : null;
            $nivelTexto = $colNivel >= 0 ? self::valorTexto($linha[$colNivel] ?? null) : null;
            $contato = $colContato >= 0 ? self::valorTexto($linha[$colContato] ?? null) : null;
            $responsaveisHistorico = [];
            foreach ($colsResponsaveis as $c) {
                $v = self::valorTexto($linha[$c] ?? null);
                if ($v) $responsaveisHistorico[] = $v;
            }

            $nomesTipos = $tipoRaw ? self::mapearTipos($tipoRaw) : [];
            $observacoesHistorico = count($responsaveisHistorico) > 0
                ? 'Histórico de responsáveis (planilha): ' . implode(' → ', $responsaveisHistorico)
                : null;

            [$clienteId, $criado] = self::obterOuCriarCliente($nomeCliente, $contato, $nivelTexto, $observacoesHistorico, $clienteIdPorNome);
            $criado ? $relatorio['clientesCriados']++ : $relatorio['clientesAtualizados']++;

            self::vincularClienteNucleo($clienteId, $nucleoId);
            self::aplicarTipos($clienteId, $nucleoId, $nomesTipos, $tipoIdPorNome);
            self::sincronizarAlocacao($clienteId, $colaboradorId, $nucleoId, $relatorio);

            $volumesPorMes = [];
            foreach ($colunasMensais as $cm) {
                $valor = self::valorNumerico($linha[$cm['col']] ?? null);
                if ($valor === null) continue;
                $chave = "{$cm['ano']}-{$cm['mes']}";
                if (!isset($volumesPorMes[$chave])) {
                    $volumesPorMes[$chave] = ['mes' => $cm['mes'], 'ano' => $cm['ano'], 'nEmpregados' => null, 'nSocios' => null, 'nAutonomos' => null, 'nEstagiarios' => null];
                }
                if ($cm['categoria'] === 'empregados') $volumesPorMes[$chave]['nEmpregados'] = $valor;
                if ($cm['categoria'] === 'socios') $volumesPorMes[$chave]['nSocios'] = $valor;
                if ($cm['categoria'] === 'autonomos') $volumesPorMes[$chave]['nAutonomos'] = $valor;
                if ($cm['categoria'] === 'estagiarios') $volumesPorMes[$chave]['nEstagiarios'] = $valor;
            }
            foreach ($volumesPorMes as $v) {
                self::upsertVolume($clienteId, $v);
                $relatorio['volumesGravados']++;
            }
        }
    }

    private static function importarAbaDomesticas(array $linhas, string $sheetName, string $nucleoId, array &$clienteIdPorNome, array &$tipoIdPorNome, array &$relatorio): void
    {
        $headerRowIdx = self::encontrarLinhaCabecalho($linhas, ['cliente']);
        if ($headerRowIdx === -1) {
            $relatorio['avisos'][] = "Aba \"{$sheetName}\": cabeçalho não encontrado, aba ignorada.";
            return;
        }
        $headerNorm = array_map(fn($h) => self::normalizar($h === null ? '' : (string) $h), $linhas[$headerRowIdx]);
        $colNome = self::indexOfContains($headerNorm, 'cliente');
        $colObs = self::indexOfContains($headerNorm, 'observa');

        $totalLinhas = count($linhas);
        for ($r = $headerRowIdx + 1; $r < $totalLinhas; $r++) {
            $linha = $linhas[$r];
            $nome = $colNome >= 0 ? self::valorTexto($linha[$colNome] ?? null) : null;
            if (!$nome) continue;
            $observacao = $colObs >= 0 ? self::valorTexto($linha[$colObs] ?? null) : null;

            [$clienteId, $criado] = self::obterOuCriarCliente($nome, null, null, $observacao, $clienteIdPorNome);
            $criado ? $relatorio['clientesCriados']++ : $relatorio['clientesAtualizados']++;
            self::vincularClienteNucleo($clienteId, $nucleoId);
            self::aplicarTipos($clienteId, $nucleoId, ['Doméstica'], $tipoIdPorNome);
        }
    }

    private static function obterOuCriarCliente(string $nomeBruto, ?string $contato, ?string $nivelOriginalTexto, ?string $observacoesHistorico, array &$clienteIdPorNome): array
    {
        $nome = trim($nomeBruto);
        $chave = self::normalizar($nome);
        $pdo = Database::get();
        if (isset($clienteIdPorNome[$chave])) {
            $id = $clienteIdPorNome[$chave];
            $sets = [];
            $args = [];
            if ($contato !== null) { $sets[] = 'contato=?'; $args[] = $contato; }
            if ($nivelOriginalTexto !== null) { $sets[] = 'nivelOriginalTexto=?'; $args[] = $nivelOriginalTexto; }
            if ($observacoesHistorico !== null) { $sets[] = 'observacoesHistorico=?'; $args[] = $observacoesHistorico; }
            if (count($sets) > 0) {
                $args[] = $id;
                $pdo->prepare('UPDATE cliente SET ' . implode(',', $sets) . ' WHERE id=?')->execute($args);
            }
            return [$id, false];
        }
        $id = Uuid::v4();
        $pdo->prepare('INSERT INTO cliente (id, nome, contato, nivelOriginalTexto, observacoesHistorico, dataCadastro, ativo) VALUES (?, ?, ?, ?, ?, NOW(), 1)')
            ->execute([$id, $nome, $contato, $nivelOriginalTexto, $observacoesHistorico]);
        $clienteIdPorNome[$chave] = $id;
        return [$id, true];
    }

    private static function vincularClienteNucleo(string $clienteId, string $nucleoId): void
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT id FROM clientenucleo WHERE clienteId=? AND nucleoId=?');
        $stmt->execute([$clienteId, $nucleoId]);
        if (!$stmt->fetchColumn()) {
            $pdo->prepare('INSERT INTO clientenucleo (id, clienteId, nucleoId) VALUES (?, ?, ?)')->execute([Uuid::v4(), $clienteId, $nucleoId]);
        }
    }

    private static function aplicarTipos(string $clienteId, string $nucleoId, array $nomesTipos, array &$tipoIdPorNome): void
    {
        $pdo = Database::get();
        foreach ($nomesTipos as $nome) {
            $chave = self::normalizar($nome);
            $tipoId = $tipoIdPorNome[$chave] ?? null;
            if (!$tipoId) {
                $stmt = $pdo->prepare('SELECT id FROM tipocliente WHERE nucleoId=? AND nome=?');
                $stmt->execute([$nucleoId, $nome]);
                $tipoId = $stmt->fetchColumn();
                if (!$tipoId) {
                    $tipoId = Uuid::v4();
                    $pdo->prepare('INSERT INTO tipocliente (id, nucleoId, nome, ativo) VALUES (?, ?, ?, 1)')->execute([$tipoId, $nucleoId, $nome]);
                }
                $tipoIdPorNome[$chave] = $tipoId;
            }
            $stmt = $pdo->prepare('SELECT id FROM clientetipo WHERE clienteId=? AND tipoClienteId=?');
            $stmt->execute([$clienteId, $tipoId]);
            if (!$stmt->fetchColumn()) {
                $pdo->prepare('INSERT INTO clientetipo (id, clienteId, nucleoId, tipoClienteId) VALUES (?, ?, ?, ?)')
                    ->execute([Uuid::v4(), $clienteId, $nucleoId, $tipoId]);
            }
        }
    }

    private static function sincronizarAlocacao(string $clienteId, string $colaboradorId, string $nucleoId, array &$relatorio): void
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT id, colaboradorId FROM alocacao WHERE clienteId=? AND nucleoId=? AND dataFim IS NULL');
        $stmt->execute([$clienteId, $nucleoId]);
        $ativa = $stmt->fetch();
        if ($ativa && $ativa['colaboradorId'] === $colaboradorId) return;
        if ($ativa) {
            $pdo->prepare('UPDATE alocacao SET dataFim=NOW() WHERE id=?')->execute([$ativa['id']]);
        }
        $pdo->prepare('INSERT INTO alocacao (id, clienteId, colaboradorId, nucleoId, dataInicio, origem) VALUES (?, ?, ?, ?, NOW(), ?)')
            ->execute([Uuid::v4(), $clienteId, $colaboradorId, $nucleoId, 'MANUAL']);
        $relatorio['alocacoesCriadas']++;
    }

    private static function upsertVolume(string $clienteId, array $v): void
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT id FROM volumemensalcliente WHERE clienteId=? AND mes=? AND ano=?');
        $stmt->execute([$clienteId, $v['mes'], $v['ano']]);
        $id = $stmt->fetchColumn();
        if ($id) {
            $pdo->prepare('UPDATE volumemensalcliente SET nEmpregados=?, nSocios=?, nAutonomos=?, nEstagiarios=? WHERE id=?')
                ->execute([$v['nEmpregados'], $v['nSocios'], $v['nAutonomos'], $v['nEstagiarios'], $id]);
        } else {
            $pdo->prepare('INSERT INTO volumemensalcliente (id, clienteId, mes, ano, nEmpregados, nSocios, nAutonomos, nEstagiarios, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)')
                ->execute([Uuid::v4(), $clienteId, $v['mes'], $v['ano'], $v['nEmpregados'], $v['nSocios'], $v['nAutonomos'], $v['nEstagiarios']]);
        }
    }

    private static function encontrarLinhaCabecalho(array $linhas, array $marcadores): int
    {
        $limite = min(count($linhas), 5);
        for ($r = 0; $r < $limite; $r++) {
            $linha = $linhas[$r] ?? [];
            $normalizada = array_map(fn($c) => self::normalizar($c === null ? '' : (string) $c), $linha);
            foreach ($marcadores as $m) {
                foreach ($normalizada as $c) {
                    if (str_contains($c, $m)) return $r;
                }
            }
        }
        return -1;
    }

    private static function indexOfContains(array $headerNorm, string ...$termos): int
    {
        foreach ($headerNorm as $i => $h) {
            foreach ($termos as $t) {
                if (str_contains($h, $t)) return $i;
            }
        }
        return -1;
    }

    private static function extrairMes(string $headerNorm): ?int
    {
        foreach (self::MESES_PT as $chave => $valor) {
            if (str_contains($headerNorm, $chave)) return $valor;
        }
        return null;
    }

    private static function extrairAno(string $headerNorm): ?int
    {
        if (!preg_match('#/(\d{2,4})\b#', $headerNorm, $m)) return null;
        $n = (int) $m[1];
        return $n < 100 ? 2000 + $n : $n;
    }

    private static function extrairCategoria(string $headerNorm): ?string
    {
        if (str_contains($headerNorm, 'empregad')) return 'empregados';
        if (str_contains($headerNorm, 'socio')) return 'socios';
        if (str_contains($headerNorm, 'autonomo')) return 'autonomos';
        if (str_contains($headerNorm, 'estagiario')) return 'estagiarios';
        return null;
    }

    private static function corrigirInconsistenciasDeBloco(array &$colunas, string $sheetName, array &$avisos): void
    {
        for ($i = 0; $i < count($colunas); $i += 4) {
            $bloco = array_slice($colunas, $i, 4, true);
            if (count($bloco) === 0) continue;
            $anoDominante = self::moda(array_map(fn($c) => $c['ano'], $bloco));
            $mesDominante = self::moda(array_map(fn($c) => $c['mes'], $bloco));
            foreach ($bloco as $idx => $c) {
                if ($c['ano'] !== $anoDominante) {
                    $avisos[] = "Aba \"{$sheetName}\": coluna \"{$c['header']}\" tinha ano {$c['ano']}, assumido {$anoDominante} (inconsistente com as colunas vizinhas do mesmo mês).";
                    $colunas[$idx]['ano'] = $anoDominante;
                }
                if ($c['mes'] !== $mesDominante) {
                    $avisos[] = "Aba \"{$sheetName}\": coluna \"{$c['header']}\" tinha mês divergente do bloco, assumido o mês predominante.";
                    $colunas[$idx]['mes'] = $mesDominante;
                }
            }
        }
    }

    private static function moda(array $valores): int
    {
        $contagem = [];
        foreach ($valores as $v) { $contagem[$v] = ($contagem[$v] ?? 0) + 1; }
        $melhor = $valores[array_key_first($valores)];
        $max = 0;
        foreach ($contagem as $v => $c) {
            if ($c > $max) { $max = $c; $melhor = $v; }
        }
        return $melhor;
    }

    private static function mapearTipos(string $raw): array
    {
        $tokens = array_values(array_filter(array_map('trim', preg_split('#[/,;]#', $raw))));
        if (count($tokens) === 0) return ['Outro'];
        $tipos = array_map([self::class, 'mapearTipoToken'], $tokens);
        return array_values(array_unique($tipos));
    }

    private static function mapearTipoToken(string $token): string
    {
        $n = self::normalizar($token);
        if (str_contains($n, 'folha')) return 'Folha';
        if (str_contains($n, 'pro labore')) return 'Pró-labore';
        if (str_contains($n, 'fator r')) return 'Fator R';
        if (str_contains($n, 'reinf')) return 'REINF';
        if (str_contains($n, 'sem mov')) return 'Sem movimento';
        if (str_contains($n, 'livro caixa')) return 'Livro Caixa';
        if (str_contains($n, 'domestic')) return 'Doméstica';
        return trim($token);
    }

    private static function valorTexto($v): ?string
    {
        if ($v === null) return null;
        $s = trim((string) $v);
        return $s !== '' ? $s : null;
    }

    private static function valorNumerico($v): ?int
    {
        if ($v === null || $v === '') return null;
        if (is_numeric($v)) return (int) $v;
        $n = preg_replace('/[^\d-]/', '', (string) $v);
        return $n === '' ? null : (int) $n;
    }

    public static function normalizar(string $s): string
    {
        $s = \Normalizer::normalize($s, \Normalizer::FORM_D);
        $s = preg_replace('/[\x{0300}-\x{036f}]/u', '', $s);
        $s = str_replace('-', ' ', $s);
        $s = mb_strtolower($s);
        $s = preg_replace('/\s+/', ' ', $s);
        return trim($s);
    }
}
