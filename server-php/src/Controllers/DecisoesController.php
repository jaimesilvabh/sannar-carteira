<?php

namespace Sannar\Controllers;

use Sannar\Auth;
use Sannar\Http;
use Sannar\HttpException;
use Sannar\Rbac;
use Sannar\Services\Alerts;

class DecisoesController
{
    public static function list(array $params): void
    {
        Auth::requireAuth();
        $nucleoIdQuery = Http::query('nucleoId');
        $permitidos = Rbac::scopedNucleoIds();
        if ($nucleoIdQuery && $permitidos !== null && !in_array($nucleoIdQuery, $permitidos, true)) {
            throw new HttpException(403, 'Você não tem acesso a este núcleo');
        }

        if ($nucleoIdQuery) {
            Http::json(Alerts::gerarAlertas($nucleoIdQuery));
            return;
        }
        if ($permitidos === null) {
            Http::json(Alerts::gerarAlertas());
            return;
        }
        $todos = [];
        foreach ($permitidos as $nucleoId) {
            array_push($todos, ...Alerts::gerarAlertas($nucleoId));
        }
        Http::json($todos);
    }
}
