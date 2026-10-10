<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use NETipar\Consent\ConsentDecision;
use NETipar\Consent\Exceptions\UnknownCategoryException;
use NETipar\Consent\Facades\Consent;

function consentRequestWith(string $cookies): Request
{
    return Request::create('/', server: ['HTTP_COOKIE' => $cookies]);
}

it('always allows required categories', function (): void {
    expect(Consent::allows('necessary'))->toBeTrue();
});

it('denies optional categories without a decision', function (): void {
    expect(Consent::allows('analytics'))->toBeFalse()
        ->and(Consent::hasDecision())->toBeFalse()
        ->and(Consent::granted())->toBe(['necessary']);
});

it('allows a category granted in a valid decision', function (): void {
    $request = consentRequestWith('__cookie_consent=necessary%2Canalytics; __cookie_consent_v=1');

    expect(Consent::allows('analytics', $request))->toBeTrue()
        ->and(Consent::allows('marketing', $request))->toBeFalse()
        ->and(Consent::granted($request))->toBe(['necessary', 'analytics']);
});

it('ignores a decision made for another config version', function (): void {
    $request = consentRequestWith('__cookie_consent=necessary%2Canalytics; __cookie_consent_v=0');

    expect(Consent::allows('analytics', $request))->toBeFalse()
        ->and(Consent::hasDecision($request))->toBeFalse()
        ->and(Consent::decision($request))->toEqual(ConsentDecision::none());
});

it('reports hasDecision for every cookie combination', function (string $cookies, bool $expected): void {
    expect(Consent::hasDecision(consentRequestWith($cookies)))->toBe($expected);
})->with([
    'both, current version' => ['__cookie_consent=necessary; __cookie_consent_v=1', true],
    'both, stale version' => ['__cookie_consent=necessary; __cookie_consent_v=0', false],
    'value only' => ['__cookie_consent=necessary', false],
    'version only' => ['__cookie_consent_v=1', false],
    'neither' => ['other=1', false],
]);

it('reads the current request through the facade', function (): void {
    $this->withHeader('Cookie', '__cookie_consent=necessary%2Cmarketing; __cookie_consent_v=1')
        ->get('/consent-probe')
        ->assertOk()
        ->assertExactJson(['necessary', 'marketing']);
});

it('reads no decision from a request without cookies through the facade', function (): void {
    $this->get('/consent-probe')->assertOk()->assertExactJson(['necessary']);
});

it('throws for unknown categories and lists the known ones', function (): void {
    expect(fn () => Consent::allows('nope'))
        ->toThrow(UnknownCategoryException::class, 'Unknown consent category "nope". Known: necessary, analytics, marketing');
});

it('exposes the configured identity', function (): void {
    expect(Consent::version())->toBe('1')
        ->and(Consent::cookieName())->toBe('__cookie_consent')
        ->and(Consent::versionCookieName())->toBe('__cookie_consent_v')
        ->and(Consent::categories())->toHaveCount(3);
});

it('builds the client config', function (): void {
    config(['consent.categories.analytics.cookies' => ['_ga', '_ga_*']]);
    freshConsent();

    expect(Consent::clientConfig())->toBe([
        'version' => '1',
        'cookie' => [
            'name' => '__cookie_consent',
            'versionName' => '__cookie_consent_v',
            'lifetimeDays' => 365,
            'domain' => null,
            'sameSite' => 'Lax',
            'secure' => null,
        ],
        'categories' => [
            ['key' => 'necessary', 'required' => true, 'label' => 'Necessary', 'description' => 'Required for the site to work (session, security, storing your cookie choice).', 'cookies' => []],
            ['key' => 'analytics', 'required' => false, 'label' => 'Analytics', 'description' => 'Usage statistics that help us understand how the site is used and improve it.', 'cookies' => ['_ga', '_ga_*']],
            ['key' => 'marketing', 'required' => false, 'label' => 'Marketing', 'description' => 'Measure campaigns and show relevant offers.', 'cookies' => []],
        ],
        'texts' => Consent::texts(),
        'reloadOnRevoke' => true,
        'log' => null,
        'policyUrl' => null,
        'google' => null,
    ]);
});

it('includes the google block when tags are configured', function (): void {
    config(['consent.google.tags' => [['id' => 'G-8B396W54EK', 'category' => 'analytics']]]);
    freshConsent();

    expect(Consent::clientConfig()['google'])->toBe([
        'tags' => [['id' => 'G-8B396W54EK', 'category' => 'analytics']],
        'signals' => [
            'analytics_storage' => 'analytics',
            'ad_storage' => 'marketing',
            'ad_user_data' => 'marketing',
            'ad_personalization' => 'marketing',
        ],
        'adsDataRedaction' => false,
        'urlPassthrough' => false,
    ]);
});

it('resolves labels and texts for the current locale', function (): void {
    expect(Consent::clientConfig()['categories'][1]['label'])->toBe('Analytics')
        ->and(Consent::texts()['acceptAll'])->toBe('Accept all');

    app()->setLocale('hu');

    expect(Consent::clientConfig()['categories'][1]['label'])->toBe('Analitika')
        ->and(Consent::texts()['acceptAll'])->toBe('Összes elfogadása')
        ->and(Consent::clientConfig()['texts']['acceptAll'])->toBe('Összes elfogadása');
});

it('exposes every banner text under its camelCase key', function (): void {
    expect(array_keys(Consent::texts()))->toBe([
        'title', 'description', 'policy', 'acceptAll', 'rejectAll', 'settings',
        'settingsTitle', 'settingsIntro', 'save', 'cancel',
    ]);
});

it('falls back to a headline label for categories without a translation', function (): void {
    config(['consent.categories.social' => ['required' => false, 'cookies' => []]]);
    freshConsent();

    $social = Consent::clientConfig()['categories'][3];

    expect($social['key'])->toBe('social')
        ->and($social['label'])->toBe('Social')
        ->and($social['description'])->toBe('');
});
