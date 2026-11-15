<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Request as RequestFacade;
use Illuminate\Support\Facades\Vite;
use NETipar\Consent\Facades\Consent;

it('renders the consent conditional', function (?string $cookie, string $expected): void {
    $template = "@consent('analytics') yes @else no @endconsent";

    if ($cookie !== null) {
        $request = Request::create('/', server: ['HTTP_COOKIE' => $cookie]);
        app()->instance('request', $request);
        RequestFacade::swap($request);
    }

    expect(trim(Blade::render($template)))->toBe($expected);
})->with([
    'no cookies' => [null, 'no'],
    'granted' => ['__cookie_consent=necessary%2Canalytics; __cookie_consent_v=1', 'yes'],
    'stale version' => ['__cookie_consent=necessary%2Canalytics; __cookie_consent_v=0', 'no'],
]);

it('renders the client config as a non-executable json script', function (): void {
    $html = Blade::render('@consentConfig');

    expect($html)->toStartWith('<script type="application/json" id="consent-config">')
        ->and($html)->toEndWith('</script>');

    $json = substr($html, strlen('<script type="application/json" id="consent-config">'), -strlen('</script>'));

    expect(json_decode($json, true, flags: JSON_THROW_ON_ERROR))->toMatchArray([
        'version' => '1',
        'reloadOnRevoke' => true,
    ]);
});

it('escapes script-breaking sequences in the json', function (): void {
    config(['consent.policy_url' => '</script><script>alert(1)</script>']);
    freshConsent();

    $html = Blade::render('@consentConfig');

    $escaped = sprintf('%1$su003C/script%1$su003E%1$su003Cscript%1$su003Ealert(1)%1$su003C/script%1$su003E', '\\');

    expect($html)->toContain($escaped)
        ->and(substr_count($html, '</script>'))->toBe(1);
});

it('prints only the json script in basic mode and without a mode', function (?string $mode): void {
    config(['consent.google.containers' => [['id' => 'GTM-ABC123']]]);

    if ($mode !== null) {
        config(['consent.google.mode' => $mode]);
    } else {
        config(['consent.google' => Arr::except(config('consent.google'), 'mode')]);
    }

    freshConsent();

    $html = Blade::render('@consentConfig');

    expect($html)->toStartWith('<script type="application/json" id="consent-config">')
        ->and(substr_count($html, '<script'))->toBe(1)
        ->and($html)->not->toContain('__netiparConsentGoogle');
})->with([
    'basic' => ['basic'],
    'missing' => [null],
]);

it('prints only the json script in advanced mode without google tags', function (): void {
    config(['consent.google.mode' => 'advanced']);
    freshConsent();

    expect(substr_count(Blade::render('@consentConfig'), '<script'))->toBe(1);
});

it('prints the inline consent mode bootstrap after the json in advanced mode', function (): void {
    config([
        'consent.google.mode' => 'advanced',
        'consent.google.containers' => [['id' => 'GTM-ABC123']],
        'consent.google.tags' => [['id' => 'G-8B396W54EK', 'category' => 'analytics']],
    ]);
    freshConsent();

    $html = Blade::render('@consentConfig');
    $json = '<script type="application/json" id="consent-config">';

    expect($html)->toStartWith($json)
        ->and(substr_count($html, '</script>'))->toBe(2)
        ->and($html)->toContain('</script><script>(')
        ->and($html)->toContain(trim((string) file_get_contents(__DIR__.'/../../resources/js/google-advanced.js')))
        ->and($html)->toEndWith(', window);</script>');

    // The bootstrap gets the cookie names, the category keys and the google block — no texts, no decision.
    preg_match('/\)\((\{.*\}), window\);<\/script>$/s', $html, $matches);

    expect(json_decode($matches[1], true, flags: JSON_THROW_ON_ERROR))->toBe([
        'version' => '1',
        'cookie' => ['name' => '__cookie_consent', 'versionName' => '__cookie_consent_v', 'domain' => null],
        'categories' => [
            ['key' => 'necessary', 'required' => true],
            ['key' => 'analytics', 'required' => false],
            ['key' => 'marketing', 'required' => false],
        ],
        'google' => Consent::clientConfig()['google'],
    ]);
});

it('renders the same advanced output whatever the visitor decided', function (): void {
    config(['consent.google.mode' => 'advanced', 'consent.google.containers' => [['id' => 'GTM-ABC123']]]);
    freshConsent();

    $undecided = Blade::render('@consentConfig');

    $request = Request::create('/', server: ['HTTP_COOKIE' => '__cookie_consent=necessary%2Canalytics; __cookie_consent_v=1']);
    app()->instance('request', $request);
    RequestFacade::swap($request);

    expect(Blade::render('@consentConfig'))->toBe($undecided);
});

it('puts the given CSP nonce on the bootstrap script, escaped', function (): void {
    config(['consent.google.mode' => 'advanced', 'consent.google.containers' => [['id' => 'GTM-ABC123']]]);
    freshConsent();

    expect(Blade::render('@consentConfig($nonce)', ['nonce' => 'abc"123']))
        ->toContain('</script><script nonce="abc&quot;123">(')
        ->and(Blade::render('@consentConfig(nonce: $nonce)', ['nonce' => 'xyz']))
        ->toContain('<script nonce="xyz">(');
});

it('falls back to the Vite CSP nonce', function (): void {
    config(['consent.google.mode' => 'advanced', 'consent.google.containers' => [['id' => 'GTM-ABC123']]]);
    freshConsent();
    Vite::useCspNonce('vite-nonce');

    expect(Blade::render('@consentConfig'))->toContain('<script nonce="vite-nonce">(')
        ->and(Blade::render('@consentConfig($nonce)', ['nonce' => 'own']))->toContain('<script nonce="own">(');
});

it('ships a bootstrap that cannot break out of its inline script', function (): void {
    $source = strtolower((string) file_get_contents(__DIR__.'/../../resources/js/google-advanced.js'));

    expect($source)->not->toContain('</script')
        ->and($source)->not->toContain('<!--');
});
