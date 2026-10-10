<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Request as RequestFacade;

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
