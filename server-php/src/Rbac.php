<?php

namespace Sannar;

/**
 * Regras de escopo por núcleo (seção 12 do prompt original): DIRECAO enxerga tudo; LIDER_NUCLEO
 * só pode ler/gravar dados do próprio núcleo. Reforçado aqui no backend, nunca só na tela.
 */
class Rbac
{
    /** Lista de nucleoIds que o usuário pode acessar, ou null = sem restrição (DIRECAO). */
    public static function scopedNucleoIds(): ?array
    {
        if (Auth::role() === 'DIRECAO') {
            return null;
        }
        $n = Auth::nucleoId();
        return $n ? [$n] : [];
    }

    /** Lança 403 se um LIDER_NUCLEO tentar acessar/gravar um núcleo que não é o seu. */
    public static function assertNucleoAccess(?string $nucleoId): void
    {
        if (Auth::role() === 'DIRECAO') {
            return;
        }
        if (!$nucleoId || $nucleoId !== Auth::nucleoId()) {
            throw new HttpException(403, 'Você não tem acesso a este núcleo');
        }
    }
}
