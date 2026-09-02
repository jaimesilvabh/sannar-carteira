<?php
// Usado apenas com `php -S` para desenvolvimento/teste local — simula o rewrite que o .htaccess
// faz em produção (Apache), onde toda requisição cai no index.php. Não é usado no deploy real.
require __DIR__ . '/public/index.php';
