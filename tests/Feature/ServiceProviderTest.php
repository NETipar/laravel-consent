<?php

declare(strict_types=1);

use Illuminate\Support\ServiceProvider;
use NETipar\Consent\Config\ConsentConfig;
use NETipar\Consent\ConsentManager;
use NETipar\Consent\ConsentServiceProvider;
use NETipar\Consent\Cookies\ConsentCookieReader;
use NETipar\Consent\Facades\Consent;

it('merges the package config', function (): void {
    expect(config('consent.cookie.name'))->toBe('__cookie_consent');
});

it('publishes the config file under the consent-config tag', function (): void {
    // Not published for real: a config file written into the shared skeleton would be picked up by
    // every parallel worker booting at that moment.
    $paths = ServiceProvider::pathsToPublish(ConsentServiceProvider::class, 'consent-config');

    expect(array_map(realpath(...), array_keys($paths)))->toBe([realpath(__DIR__.'/../../config/consent.php')])
        ->and(array_values($paths))->toBe([config_path('consent.php')]);
});

it('resolves the facade alias', function (): void {
    /** @var array{extra: array{laravel: array{aliases: array<string, class-string>}}} $composer */
    $composer = json_decode((string) file_get_contents(__DIR__.'/../../composer.json'), true, flags: JSON_THROW_ON_ERROR);

    expect($composer['extra']['laravel']['aliases'])->toBe(['Consent' => Consent::class])
        ->and(class_exists('Consent'))->toBeTrue()
        ->and(Consent::getFacadeRoot())->toBeInstanceOf(ConsentManager::class);
});

it('shares one manager instance', function (): void {
    expect(app(ConsentManager::class))->toBe(app(ConsentManager::class));
});

it('rebinds the config on every resolution', function (): void {
    expect(app(ConsentConfig::class))->not->toBe(app(ConsentConfig::class))
        ->and(app(ConsentCookieReader::class))->not->toBe(app(ConsentCookieReader::class));
});
