<?php

declare(strict_types=1);

use Illuminate\Support\Arr;
use NETipar\Consent\ConsentManager;
use NETipar\Consent\Tests\LogTestCase;
use NETipar\Consent\Tests\TestCase;
use NETipar\Consent\Tests\ThrottledLogTestCase;

uses(TestCase::class)->in('Feature');
// The log route, rate limiter and migration are registered at boot, so these folders boot with the log enabled.
uses(LogTestCase::class)->in('Log');
uses(ThrottledLogTestCase::class)->in('Throttle');

/**
 * Drop the cached manager so it is rebuilt from the current config() values.
 */
function freshConsent(): ConsentManager
{
    app()->forgetInstance(ConsentManager::class);

    return app(ConsentManager::class);
}

/**
 * The package default config with a single dot-path overridden.
 *
 * @return array<string, mixed>
 */
function consentConfigWith(?string $path = null, mixed $value = null): array
{
    /** @var array<string, mixed> $config */
    $config = require __DIR__.'/../config/consent.php';

    if ($path !== null) {
        Arr::set($config, $path, $value);
    }

    return $config;
}
