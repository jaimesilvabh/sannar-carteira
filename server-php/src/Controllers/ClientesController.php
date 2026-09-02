<?php

namespace Sannar\Controllers;

use Sannar\Audit;
use Sannar\Auth;
use Sannar\Database;
use Sannar\Http;
use Sannar\HttpException;
use Sannar\Rbac;
use Sannar\Services\Scoring;
use Sannar\Uuid;

class ClientesController
{
    public static function list(array $params): void
    {
        Auth::requireAuth();
        $nucleoId = Http::query('nucleoId');
        if ($nucleoId) {
            Rbac::assertNucleoAccess($nucleoId);
        }
        $permitidos = Rbac::scopedNucleoIds();
        $filtroAtivo = Http::query('ativo') === 'todos' ? null : (Http::query('ativo') === 'false' ? 0 : 1);
        $busca = Http::query('q');

        $pdo = Database::get();
        $where = [];
        $args = [];
        if ($nucleoId) {
            $where[] = 'cn.nucleoId = ?';
            $args[] = $nucleoId;
        } elseif ($permitidos !== null) {
            if (count($permitidos) === 0) {
                Http::json([]);
                return;
            }
            $ph = implode(',', array_fill(0, count($permitidos), '?'));
            $where[] = "cn.nucleoId IN ($ph)";
            array_push($args, ...$permitidos);
        }
        if ($filtroAtivo !== null) {
            $where[] = 'c.ativo = ?';
            $args[] = $filtroAtivo;
        }
        if ($busca) {
            $where[] = 'c.nome LIKE ?';
            $args[] = '%' . $busca . '%';
        }
        $whereSql = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';
        $sql = "SELECT DISTINCT c.* FROM cliente c INNER JOIN clientenucleo cn ON cn.clienteId = c.id $whereSql ORDER BY c.nome ASC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($args);
        $clientes = $stmt->fetchAll();

        $clienteIds = array_column($clientes, 'id');
        $pontuacoes = $nucleoId ? Scoring::calcularPontuacoesClientes($clienteIds, $nucleoId) : [];
        $tiposPorCliente = self::buscarTiposPorCliente($clienteIds, $nucleoId);

        $out = array_map(function ($c) use ($pontuacoes, $tiposPorCliente) {
            $c['tipos'] = $tiposPorCliente[$c['id']] ?? [];
            $c['pontuacao'] = $pontuacoes[$c['id']] ?? null;
            return $c;
        }, $clientes);
        Http::json($out);
    }

    public static function get(array $params): void
    {
        Auth::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM cliente WHERE id = ?');
        $stmt->execute([$params['id']]);
        $cliente = $stmt->fetch();
        if (!$cliente) {
            throw new HttpException(404, 'Cliente não encontrado');
        }

        $stmt = $pdo->prepare('SELECT cn.*, n.nome AS nucleoNome FROM clientenucleo cn INNER JOIN nucleo n ON n.id = cn.nucleoId WHERE cn.clienteId = ?');
        $stmt->execute([$params['id']]);
        $vinculos = $stmt->fetchAll();

        $permitidos = Rbac::scopedNucleoIds();
        if ($permitidos !== null) {
            $nucleoIds = array_column($vinculos, 'nucleoId');
            if (count(array_intersect($nucleoIds, $permitidos)) === 0) {
                throw new HttpException(403, 'Você não tem acesso a este cliente');
            }
        }

        $pontuacoesPorNucleo = [];
        $tiposPorNucleo = [];
        foreach ($vinculos as $v) {
            if ($permitidos !== null && !in_array($v['nucleoId'], $permitidos, true)) {
                continue;
            }
            $pontuacoesPorNucleo[$v['nucleoId']] = Scoring::calcularPontuacaoCliente($params['id'], $v['nucleoId']);
            $tipos = self::buscarTiposPorCliente([$params['id']], $v['nucleoId']);
            $tiposPorNucleo[$v['nucleoId']] = $tipos[$params['id']] ?? [];
        }

        $cliente['pontuacoesPorNucleo'] = $pontuacoesPorNucleo;
        $cliente['tiposPorNucleo'] = $tiposPorNucleo;
        Http::json($cliente);
    }

    public static function create(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $body = Http::body();
        $nome = Http::required($body, 'nome');
        $nucleoIds = Http::required($body, 'nucleoIds');
        foreach ($nucleoIds as $n) {
            Rbac::assertNucleoAccess($n);
        }

        $pdo = Database::get();
        $id = Uuid::v4();
        $pdo->prepare('INSERT INTO cliente (id, nome, contato, nivelOriginalTexto, dataCadastro, ativo) VALUES (?, ?, ?, ?, NOW(), 1)')
            ->execute([$id, $nome, $body['contato'] ?? null, $body['nivelOriginalTexto'] ?? null]);
        foreach ($nucleoIds as $n) {
            $pdo->prepare('INSERT INTO clientenucleo (id, clienteId, nucleoId) VALUES (?, ?, ?)')->execute([Uuid::v4(), $id, $n]);
        }
        $tipoIds = $body['tipoIds'] ?? [];
        foreach ($tipoIds as $tipoId) {
            $pdo->prepare('INSERT INTO clientetipo (id, clienteId, nucleoId, tipoClienteId) VALUES (?, ?, ?, ?)')
                ->execute([Uuid::v4(), $id, $nucleoIds[0], $tipoId]);
        }

        Audit::registrar('CRIAR', 'Cliente', $id, $body);
        $stmt = $pdo->prepare('SELECT * FROM cliente WHERE id = ?');
        $stmt->execute([$id]);
        Http::json($stmt->fetch(), 201);
    }

    public static function update(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM cliente WHERE id = ?');
        $stmt->execute([$params['id']]);
        $existente = $stmt->fetch();
        if (!$existente) {
            throw new HttpException(404, 'Cliente não encontrado');
        }
        self::assertAcessoCliente($params['id']);

        $body = Http::body();
        $nome = $body['nome'] ?? $existente['nome'];
        $contato = array_key_exists('contato', $body) ? $body['contato'] : $existente['contato'];
        $nivelOriginalTexto = array_key_exists('nivelOriginalTexto', $body) ? $body['nivelOriginalTexto'] : $existente['nivelOriginalTexto'];
        $ativo = isset($body['ativo']) ? (Http::boolFromJson($body['ativo']) ? 1 : 0) : $existente['ativo'];
        $deletedAt = isset($body['ativo']) ? (Http::boolFromJson($body['ativo']) ? null : date('Y-m-d H:i:s')) : $existente['deletedAt'];

        $pdo->prepare('UPDATE cliente SET nome=?, contato=?, nivelOriginalTexto=?, ativo=?, deletedAt=? WHERE id=?')
            ->execute([$nome, $contato, $nivelOriginalTexto, $ativo, $deletedAt, $params['id']]);
        Audit::registrar('ATUALIZAR', 'Cliente', $params['id'], $body);

        $stmt = $pdo->prepare('SELECT * FROM cliente WHERE id = ?');
        $stmt->execute([$params['id']]);
        Http::json($stmt->fetch());
    }

    public static function setTipos(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $body = Http::body();
        $nucleoId = Http::required($body, 'nucleoId');
        Rbac::assertNucleoAccess($nucleoId);
        $tipoIds = $body['tipoIds'] ?? [];

        $pdo = Database::get();
        $pdo->prepare('DELETE FROM clientetipo WHERE clienteId = ? AND nucleoId = ?')->execute([$params['id'], $nucleoId]);
        foreach ($tipoIds as $tipoId) {
            $pdo->prepare('INSERT INTO clientetipo (id, clienteId, nucleoId, tipoClienteId) VALUES (?, ?, ?, ?)')
                ->execute([Uuid::v4(), $params['id'], $nucleoId, $tipoId]);
        }
        Audit::registrar('ATUALIZAR_TIPOS', 'Cliente', $params['id'], ['nucleoId' => $nucleoId, 'tipoIds' => $tipoIds]);
        Http::json(['ok' => true]);
    }

    public static function pontuar(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $body = Http::body();
        $nucleoId = Http::required($body, 'nucleoId');
        Rbac::assertNucleoAccess($nucleoId);
        $criterioId = Http::required($body, 'criterioId');
        $valor = (int) Http::required($body, 'valor');
        if ($valor < 1 || $valor > 5) {
            throw new HttpException(400, 'valor deve estar entre 1 e 5');
        }

        $id = Uuid::v4();
        Database::get()->prepare('INSERT INTO pontuacaocriteriocliente (id, clienteId, nucleoId, criterioId, valor, mesReferencia, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())')
            ->execute([$id, $params['id'], $nucleoId, $criterioId, $valor, $body['mesReferencia'] ?? null]);

        Audit::registrar('AVALIAR', 'PontuacaoCriterioCliente', $id, $body);
        Http::json(['id' => $id], 201);
    }

    public static function delete(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT id FROM cliente WHERE id = ?');
        $stmt->execute([$params['id']]);
        if (!$stmt->fetchColumn()) {
            throw new HttpException(404, 'Cliente não encontrado');
        }
        self::assertAcessoCliente($params['id']);
        $pdo->prepare('UPDATE cliente SET ativo=0, deletedAt=NOW() WHERE id=?')->execute([$params['id']]);
        Audit::registrar('EXCLUIR', 'Cliente', $params['id']);
        Http::json(['ok' => true]);
    }

    public static function deleteDefinitivo(array $params): void
    {
        Auth::requireRole('DIRECAO');
        $pdo = Database::get();
        $id = $params['id'];
        $pdo->prepare('DELETE FROM pontuacaocriteriocliente WHERE clienteId = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM volumemensalcliente WHERE clienteId = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM clientetipo WHERE clienteId = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM alocacao WHERE clienteId = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM clientenucleo WHERE clienteId = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM cliente WHERE id = ?')->execute([$id]);
        Audit::registrar('EXCLUIR_DEFINITIVO', 'Cliente', $id);
        Http::json(['ok' => true]);
    }

    public static function batchDelete(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $body = Http::body();
        $ids = Http::required($body, 'ids');
        self::assertAcessoClientes($ids);
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $stmt = Database::get()->prepare("UPDATE cliente SET ativo=0, deletedAt=NOW() WHERE id IN ($ph)");
        $stmt->execute($ids);
        Audit::registrar('EXCLUIR_LOTE', 'Cliente', null, ['ids' => $ids]);
        Http::json(['afetados' => $stmt->rowCount()]);
    }

    public static function batchToggleActive(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $body = Http::body();
        $ids = Http::required($body, 'ids');
        $ativo = Http::boolFromJson($body['ativo'] ?? false);
        self::assertAcessoClientes($ids);
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $stmt = Database::get()->prepare("UPDATE cliente SET ativo=?, deletedAt=? WHERE id IN ($ph)");
        $stmt->execute([$ativo ? 1 : 0, $ativo ? null : date('Y-m-d H:i:s'), ...$ids]);
        Audit::registrar($ativo ? 'ATIVAR_LOTE' : 'DESATIVAR_LOTE', 'Cliente', null, ['ids' => $ids]);
        Http::json(['afetados' => $stmt->rowCount()]);
    }

    public static function batchReassign(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $body = Http::body();
        $ids = Http::required($body, 'ids');
        $colaboradorId = Http::required($body, 'colaboradorId');
        $nucleoId = Http::required($body, 'nucleoId');
        Rbac::assertNucleoAccess($nucleoId);
        self::assertAcessoClientes($ids);

        $pdo = Database::get();
        $afetados = 0;
        foreach ($ids as $clienteId) {
            $stmt = $pdo->prepare('SELECT id, colaboradorId FROM alocacao WHERE clienteId=? AND nucleoId=? AND dataFim IS NULL');
            $stmt->execute([$clienteId, $nucleoId]);
            $ativa = $stmt->fetch();
            if ($ativa) {
                if ($ativa['colaboradorId'] === $colaboradorId) {
                    continue;
                }
                $pdo->prepare('UPDATE alocacao SET dataFim=NOW() WHERE id=?')->execute([$ativa['id']]);
            }
            $pdo->prepare('INSERT INTO alocacao (id, clienteId, colaboradorId, nucleoId, dataInicio, origem) VALUES (?, ?, ?, ?, NOW(), ?)')
                ->execute([Uuid::v4(), $clienteId, $colaboradorId, $nucleoId, 'MANUAL']);
            $afetados++;
        }
        Audit::registrar('REATRIBUIR_LOTE', 'Alocacao', null, ['ids' => $ids, 'colaboradorId' => $colaboradorId, 'nucleoId' => $nucleoId]);
        Http::json(['afetados' => $afetados]);
    }

    public static function batchPontuacao(array $params): void
    {
        Auth::requireRole('DIRECAO', 'LIDER_NUCLEO');
        $body = Http::body();
        $ids = Http::required($body, 'ids');
        $nucleoId = Http::required($body, 'nucleoId');
        Rbac::assertNucleoAccess($nucleoId);
        $criterioId = Http::required($body, 'criterioId');
        $valor = (int) Http::required($body, 'valor');
        if ($valor < 1 || $valor > 5) {
            throw new HttpException(400, 'valor deve estar entre 1 e 5');
        }
        self::assertAcessoClientes($ids);

        $pdo = Database::get();
        $stmt = $pdo->prepare('INSERT INTO pontuacaocriteriocliente (id, clienteId, nucleoId, criterioId, valor, mesReferencia, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())');
        foreach ($ids as $clienteId) {
            $stmt->execute([Uuid::v4(), $clienteId, $nucleoId, $criterioId, $valor, $body['mesReferencia'] ?? null]);
        }
        Audit::registrar('AVALIAR_LOTE', 'PontuacaoCriterioCliente', null, ['ids' => $ids, 'nucleoId' => $nucleoId, 'criterioId' => $criterioId, 'valor' => $valor]);
        Http::json(['afetados' => count($ids)]);
    }

    private static function assertAcessoCliente(string $clienteId): void
    {
        $permitidos = Rbac::scopedNucleoIds();
        if ($permitidos === null) {
            return;
        }
        $stmt = Database::get()->prepare('SELECT nucleoId FROM clientenucleo WHERE clienteId = ?');
        $stmt->execute([$clienteId]);
        $nucleoIds = $stmt->fetchAll(\PDO::FETCH_COLUMN);
        if (count(array_diff($nucleoIds, $permitidos)) > 0) {
            throw new HttpException(403, 'Você não tem acesso a este cliente');
        }
    }

    private static function assertAcessoClientes(array $ids): void
    {
        $permitidos = Rbac::scopedNucleoIds();
        if ($permitidos === null || count($ids) === 0) {
            return;
        }
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $stmt = Database::get()->prepare("SELECT nucleoId FROM clientenucleo WHERE clienteId IN ($ph)");
        $stmt->execute($ids);
        $nucleoIds = $stmt->fetchAll(\PDO::FETCH_COLUMN);
        if (count(array_diff($nucleoIds, $permitidos)) > 0) {
            throw new HttpException(403, 'Um ou mais clientes não pertencem ao seu núcleo');
        }
    }

    /** @return array<string, array{id:string,nome:string}[]> */
    public static function buscarTiposPorCliente(array $clienteIds, ?string $nucleoId = null): array
    {
        $mapa = [];
        if (count($clienteIds) === 0) {
            return $mapa;
        }
        $ph = implode(',', array_fill(0, count($clienteIds), '?'));
        $args = $clienteIds;
        $sql = "SELECT ct.clienteId, tc.id, tc.nome FROM clientetipo ct INNER JOIN tipocliente tc ON tc.id = ct.tipoClienteId WHERE ct.clienteId IN ($ph)";
        if ($nucleoId) {
            $sql .= ' AND ct.nucleoId = ?';
            $args[] = $nucleoId;
        }
        $stmt = Database::get()->prepare($sql);
        $stmt->execute($args);
        foreach ($stmt->fetchAll() as $row) {
            $mapa[$row['clienteId']][] = ['id' => $row['id'], 'nome' => $row['nome']];
        }
        return $mapa;
    }
}
