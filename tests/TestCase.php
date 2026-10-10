<?php

declare(strict_types=1);

namespace NETipar\Consent\Tests;

use Illuminate\Support\Facades\Route;
use NETipar\Consent\ConsentServiceProvider;
use NETipar\Consent\Facades\Consent;
use Orchestra\Testbench\TestCase as Orchestra;

class TestCase extends Orchestra
{
    /**
     * @return array<int, class-string>
     */
    protected function getPackageProviders($app): array
    {
        return [
            ConsentServiceProvider::class,
        ];
    }

    /**
     * @return array<string, class-string>
     */
    protected function getPackageAliases($app): array
    {
        return [
            'Consent' => Consent::class,
        ];
    }

    protected function defineRoutes($router): void
    {
        Route::get('/consent-probe', fn (): array => Consent::granted());
    }
}
