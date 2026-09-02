<?php

namespace Sannar;

class Audit
{
    public static function registrar(string $acao, string $entidade, ?string $entidadeId = null, mixed $detalhe = null): void
    {
        $stmt = Database::get()->prepare(
            'INSERT INTO auditlog (id, userId, acao, entidade, entidadeId, detalhe, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())'
        );
        $stmt->execute([
            Uuid::v4(),
            Auth::userId(),
            $acao,
            $entidade,
            $entidadeId,
            $detalhe !== null ? json_encode($detalhe, JSON_UNESCAPED_UNICODE) : null,
        ]);
    }
}
