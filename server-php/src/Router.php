<?php

namespace Sannar;

/** Roteador simples: casa método + caminho (com parâmetros {tipo_assim}) contra uma lista de rotas registradas. */
class Router
{
    private array $routes = [];

    // $handler não é tipado como `callable` de propósito: um array [ClassName::class, 'metodo']
    // só é resolvido (e a classe autoloadada) no momento do dispatch, não no registro da rota —
    // isso permite registrar todas as rotas de uma vez mesmo com controllers ainda não escritos.
    public function get(string $pattern, $handler): void
    {
        $this->routes[] = ['GET', $pattern, $handler];
    }

    public function post(string $pattern, $handler): void
    {
        $this->routes[] = ['POST', $pattern, $handler];
    }

    public function put(string $pattern, $handler): void
    {
        $this->routes[] = ['PUT', $pattern, $handler];
    }

    public function delete(string $pattern, $handler): void
    {
        $this->routes[] = ['DELETE', $pattern, $handler];
    }

    public function dispatch(string $method, string $path): void
    {
        foreach ($this->routes as [$routeMethod, $pattern, $handler]) {
            if ($routeMethod !== $method) {
                continue;
            }
            $regex = '#^' . preg_replace('/\{([a-zA-Z_]+)\}/', '(?P<$1>[^/]+)', $pattern) . '$#';
            if (preg_match($regex, $path, $matches)) {
                $params = array_filter($matches, fn($k) => !is_int($k), ARRAY_FILTER_USE_KEY);
                try {
                    $handler($params);
                } catch (HttpException $e) {
                    Http::json(['error' => $e->getMessage()], $e->status);
                } catch (\Throwable $e) {
                    error_log((string) $e);
                    Http::json(['error' => 'Erro interno do servidor'], 500);
                }
                return;
            }
        }
        Http::json(['error' => 'Rota não encontrada'], 404);
    }
}
