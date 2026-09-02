<?php

namespace Sannar\Services;

use Sannar\Database;
use Sannar\Uuid;

class AllocationSuggestion
{
    private const NIVEIS_CLIENTE = ['N1', 'N2', 'N3', 'N4'];

    private static function nivelRank(string $nivel): int
    {
        return array_search($nivel, self::NIVEIS_CLIENTE, true);
    }

    /** Sugere colaboradores aptos (nível técnico compatível), ordenados por menor carga relativa. */
    public static function sugerirColaboradores(string $nucleoId, string $nivelCliente, int $top = 5): array
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM colaborador WHERE nucleoId = ? AND ativo = 1');
        $stmt->execute([$nucleoId]);
        $colaboradores = $stmt->fetchAll();

        $stmt = $pdo->prepare('SELECT * FROM regracorrespondencia WHERE nucleoId = ?');
        $stmt->execute([$nucleoId]);
        $regraMap = [];
        foreach ($stmt->fetchAll() as $r) {
            $regraMap[$r['nivelTecnico']] = $r['nivelClienteMaximo'];
        }

        $aptos = array_filter($colaboradores, function ($c) use ($regraMap, $nivelCliente) {
            $max = $c['excecaoNivelClienteMax'] ?: ($regraMap[$c['nivelTecnico']] ?? null);
            if (!$max) return false;
            return self::nivelRank($nivelCliente) <= self::nivelRank($max);
        });

        $resultados = [];
        foreach ($aptos as $colaborador) {
            $stmt = $pdo->prepare('SELECT clienteId FROM alocacao WHERE colaboradorId = ? AND nucleoId = ? AND dataFim IS NULL');
            $stmt->execute([$colaborador['id'], $nucleoId]);
            $clienteIds = $stmt->fetchAll(\PDO::FETCH_COLUMN);

            $pontuacoes = Scoring::calcularPontuacoesClientes($clienteIds, $nucleoId);
            $pontuacaoTotal = array_sum(array_map(fn($p) => $p['pontuacaoTotal'], $pontuacoes));
            $carga = $colaborador['capacidadeMaximaPontos']
                ? $pontuacaoTotal / (float) $colaborador['capacidadeMaximaPontos']
                : count($clienteIds);

            $resultados[] = [
                'colaboradorId' => $colaborador['id'],
                'nome' => $colaborador['nome'],
                'nivelTecnico' => $colaborador['nivelTecnico'],
                'nClientesAtivos' => count($clienteIds),
                'pontuacaoCarteiraAtual' => $pontuacaoTotal,
                'capacidadeMaximaPontos' => $colaborador['capacidadeMaximaPontos'] !== null ? (float) $colaborador['capacidadeMaximaPontos'] : null,
                'cargaRelativa' => $carga,
            ];
        }

        usort($resultados, fn($a, $b) => $a['cargaRelativa'] <=> $b['cargaRelativa']);
        return array_slice($resultados, 0, $top);
    }

    /** Cria uma alocação, fechando (dataFim) qualquer alocação ativa anterior do mesmo cliente no núcleo. */
    public static function alocarCliente(string $clienteId, string $colaboradorId, string $nucleoId, string $origem): array
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT id FROM alocacao WHERE clienteId = ? AND nucleoId = ? AND dataFim IS NULL');
        $stmt->execute([$clienteId, $nucleoId]);
        $anteriorId = $stmt->fetchColumn();
        if ($anteriorId) {
            $pdo->prepare('UPDATE alocacao SET dataFim = NOW() WHERE id = ?')->execute([$anteriorId]);
        }

        $id = Uuid::v4();
        $pdo->prepare('INSERT INTO alocacao (id, clienteId, colaboradorId, nucleoId, dataInicio, origem) VALUES (?, ?, ?, ?, NOW(), ?)')
            ->execute([$id, $clienteId, $colaboradorId, $nucleoId, $origem]);

        $stmt = $pdo->prepare('SELECT * FROM alocacao WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch();
    }
}
