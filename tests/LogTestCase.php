<?php

declare(strict_types=1);

namespace NETipar\Consent\Tests;

use Illuminate\Foundation\Testing\RefreshDatabase;

/**
 * Boots the package with the consent log enabled (the route, rate limiter and
 * migration are registered at boot, so the config must be set before it).
 */
class LogTestCase extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, mixed>
     */
    protected function logOverrides(): array
    {
        return [];
    }

    protected function defineEnvironment($app): void
    {
        /** @var array<string, mixed> $defaults */
        $defaults = require __DIR__.'/../config/consent.php';
        /** @var array<string, mixed> $log */
        $log = $defaults['log'];

        $app['config']->set('consent.log', array_replace_recursive($log, ['enabled' => true], $this->logOverrides()));
    }
}
