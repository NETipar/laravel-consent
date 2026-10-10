<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use NETipar\Consent\Facades\Consent;

it('returns null without a policy url', function (): void {
    expect(Consent::policyUrl())->toBeNull();
});

it('returns a plain string verbatim', function (): void {
    config(['consent.policy_url' => '/cookies']);
    freshConsent();

    expect(Consent::policyUrl())->toBe('/cookies');
});

it('picks the url of the current locale and falls back to the fallback locale', function (string $locale, string $expected): void {
    config(['consent.policy_url' => ['hu' => '/suti', 'en' => '/cookies'], 'app.fallback_locale' => 'en']);
    freshConsent();
    app()->setLocale($locale);

    expect(Consent::policyUrl())->toBe($expected);
})->with([
    'hu' => ['hu', '/suti'],
    'en' => ['en', '/cookies'],
    'de falls back' => ['de', '/cookies'],
]);

it('returns null when neither the locale nor the fallback has a url', function (): void {
    config(['consent.policy_url' => ['hu' => '/suti'], 'app.fallback_locale' => 'en']);
    freshConsent();
    app()->setLocale('de');

    expect(Consent::policyUrl())->toBeNull();
});

it('resolves a registered route name', function (): void {
    Route::get('/suti-kezeles', fn (): string => 'ok')->name('cookie-policy');
    app('router')->getRoutes()->refreshNameLookups();
    config(['consent.policy_url' => 'cookie-policy']);
    freshConsent();

    expect(Consent::policyUrl())->toBe(route('cookie-policy'));
});
