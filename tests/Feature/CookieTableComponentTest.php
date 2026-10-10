<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Blade;

beforeEach(function (): void {
    $config = consentConfigWith();
    $config['categories']['necessary']['cookies'] = [['name' => 'laravel_session', 'lifetime' => 'session']];
    $config['categories']['analytics']['cookies'] = [
        '_gid',
        ['name' => '_ga', 'provider' => 'Google Analytics', 'purpose' => 'Visit measurement', 'lifetime' => 'P2Y', 'domain' => '.example.com'],
    ];
    config(['consent' => $config, 'app.fallback_locale' => 'en']);
    freshConsent();
});

it('renders a section with a table per category, unstyled', function (): void {
    $html = Blade::render('<x-consent::cookie-table />');

    expect($html)
        ->toContain('data-consent-cookie-table')
        ->toContain('data-consent-category="necessary"')
        ->toContain('data-consent-required="true"')
        ->toContain('data-consent-category="analytics"')
        ->toContain('data-consent-required="false"')
        ->toContain('<h3>Analytics</h3>')
        ->toContain('_ga')
        ->toContain('<small>(.example.com)</small>')
        ->toContain('Google Analytics')
        ->toContain('Visit measurement')
        ->not->toContain('_gid')
        ->and(substr_count($html, '<table>'))->toBe(2)
        ->and(substr_count($html, '<th scope="col">'))->toBe(8)
        ->and($html)->not->toContain('class=');
});

it('marks a category without listed cookies as empty', function (): void {
    $html = Blade::render('<x-consent::cookie-table />');

    expect($html)->toContain('data-consent-category="marketing"')
        ->and(substr_count($html, 'data-consent-empty'))->toBe(1);
});

it('hides empty categories when showEmpty is false', function (): void {
    $html = Blade::render('<x-consent::cookie-table :show-empty="false" />');

    expect($html)->not->toContain('data-consent-category="marketing"')
        ->and($html)->not->toContain('data-consent-empty');
});

it('renders only the requested categories', function (): void {
    $html = Blade::render('<x-consent::cookie-table :only="[\'analytics\']" />');

    expect(substr_count($html, 'data-consent-category='))->toBe(1)
        ->and($html)->toContain('data-consent-category="analytics"');
});

it('puts merged attributes on the root', function (): void {
    $html = Blade::render('<x-consent::cookie-table class="x" id="cookies" />');

    expect($html)->toMatch('/<div class="x" id="cookies" data-consent-cookie-table>/');
});

it('replaces the fallback markup with slot content', function (): void {
    $html = Blade::render('<x-consent::cookie-table>custom {{ count(Consent::cookieTable()) }}</x-consent::cookie-table>');

    expect($html)->toContain('custom 3')
        ->and($html)->not->toContain('<table>')
        ->and($html)->toContain('data-consent-cookie-table');
});

it('uses the headings of the current locale', function (): void {
    app()->setLocale('hu');
    $html = Blade::render('<x-consent::cookie-table />');

    expect($html)->toContain('<th scope="col">Süti</th>')
        ->toContain('<th scope="col">Szolgáltató</th>')
        ->toContain('<th scope="col">Cél</th>')
        ->toContain('<th scope="col">Élettartam</th>')
        ->toContain('Munkamenet');
});

it('accepts custom headings', function (): void {
    $html = Blade::render('<x-consent::cookie-table :headings="$headings" />', [
        'headings' => ['name' => 'N', 'provider' => 'P', 'purpose' => 'U', 'lifetime' => 'L'],
    ]);

    expect($html)->toContain('<th scope="col">N</th>')->toContain('<th scope="col">L</th>');
});
