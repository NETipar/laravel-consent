<?php

declare(strict_types=1);

use NETipar\Consent\Facades\Consent;

/**
 * @return array<string, mixed>
 */
function cookieTableConfig(): array
{
    $config = consentConfigWith();
    $config['categories']['necessary']['cookies'] = [
        ['name' => 'laravel_session', 'provider' => 'This site', 'purpose' => 'Keeps you signed in', 'lifetime' => 'session'],
    ];
    $config['categories']['analytics']['cookies'] = [
        '_gid',
        ['name' => '_ga', 'provider' => 'Google Analytics', 'purpose' => ['hu' => 'Látogatásmérés', 'en' => 'Visit measurement'], 'lifetime' => 'P2Y', 'domain' => '.example.com'],
        ['name' => '_ga_*', 'provider' => 'Google Analytics', 'purpose' => 'consent::consent.categories.analytics.label', 'lifetime' => 'PT24H'],
    ];
    $config['categories']['marketing']['cookies'] = ['_gcl_*'];

    return $config;
}

beforeEach(function (): void {
    config(['consent' => cookieTableConfig(), 'app.fallback_locale' => 'en']);
    freshConsent();
});

/**
 * @return array<string, mixed>
 */
function tableCategory(string $key): array
{
    return collect(Consent::cookieTable())->firstWhere('key', $key);
}

it('leaves plain string entries out of the table', function (): void {
    expect(collect(tableCategory('analytics')['cookies'])->pluck('name')->all())->toBe(['_ga', '_ga_*']);
});

it('includes every category in config order, empty ones with no cookies', function (): void {
    $table = Consent::cookieTable();

    expect(collect($table)->pluck('key')->all())->toBe(['necessary', 'analytics', 'marketing'])
        ->and(tableCategory('marketing')['cookies'])->toBe([])
        ->and(tableCategory('necessary'))->toMatchArray(['required' => true, 'label' => 'Necessary'])
        ->and(tableCategory('necessary')['cookies'])->toHaveCount(1);
});

it('picks the purpose by locale and falls back to the fallback locale', function (): void {
    app()->setLocale('hu');
    expect(tableCategory('analytics')['cookies'][0]['purpose'])->toBe('Látogatásmérés');

    app()->setLocale('de');
    expect(tableCategory('analytics')['cookies'][0]['purpose'])->toBe('Visit measurement');
});

it('falls back to the first translation when neither locale is present', function (): void {
    $config = cookieTableConfig();
    $config['categories']['analytics']['cookies'] = [['name' => '_ga', 'purpose' => ['hu' => 'Csak magyar']]];
    config(['consent' => $config]);
    freshConsent();
    app()->setLocale('de');

    expect(tableCategory('analytics')['cookies'][0]['purpose'])->toBe('Csak magyar');
});

it('translates a lang key purpose and passes a literal through', function (): void {
    app()->setLocale('hu');
    expect(tableCategory('analytics')['cookies'][1]['purpose'])->toBe('Analitika')
        ->and(tableCategory('necessary')['cookies'][0]['purpose'])->toBe('Keeps you signed in');

    app()->setLocale('en');
    expect(tableCategory('analytics')['cookies'][1]['purpose'])->toBe('Analytics');
});

it('resolves the session lifetime per locale', function (): void {
    app()->setLocale('en');
    expect(tableCategory('necessary')['cookies'][0]['lifetime'])->toBe('Session');

    app()->setLocale('hu');
    expect(tableCategory('necessary')['cookies'][0]['lifetime'])->toBe('Munkamenet');
});

it('humanises ISO durations per locale', function (): void {
    app()->setLocale('en');
    $en = tableCategory('analytics')['cookies'];
    app()->setLocale('hu');
    $hu = tableCategory('analytics')['cookies'];

    expect($hu[0]['lifetime'])->not->toBe($en[0]['lifetime'])
        ->and($en[0]['lifetime'])->toContain('2')
        ->and($hu[0]['lifetime'])->toContain('2')
        ->and($en[1]['lifetime'])->toContain('24')
        ->and($hu[1]['lifetime'])->toContain('24');
});

it('keeps provider, domain and a missing lifetime as given', function (): void {
    $config = cookieTableConfig();
    $config['categories']['analytics']['cookies'] = [['name' => '_ga', 'provider' => 'Google']];
    config(['consent' => $config]);
    freshConsent();

    expect(tableCategory('analytics')['cookies'][0])->toBe([
        'name' => '_ga', 'provider' => 'Google', 'purpose' => null, 'lifetime' => null, 'domain' => null,
    ]);
});

it('keeps the client config payload a flat list of names, patterns included', function (): void {
    expect(Consent::clientConfig()['categories'][1]['cookies'])->toBe(['_gid', '_ga', '_ga_*'])
        ->and(Consent::clientConfig()['categories'][2]['cookies'])->toBe(['_gcl_*'])
        ->and(Consent::clientConfig())->not->toHaveKey('cookieTable');
});

it('renders ISO durations in the units they were written in', function (string $iso, string $en, string $hu): void {
    $config = cookieTableConfig();
    $config['categories']['analytics']['cookies'] = [['name' => '_ga', 'lifetime' => $iso]];
    config(['consent' => $config]);
    freshConsent();

    app()->setLocale('en');
    expect(tableCategory('analytics')['cookies'][0]['lifetime'])->toBe($en);

    app()->setLocale('hu');
    expect(tableCategory('analytics')['cookies'][0]['lifetime'])->toBe($hu);
})->with([
    'days stay days' => ['P90D', '90 days', '90 nap'],
    'months stay months' => ['P13M', '13 months', '13 hónap'],
    'years' => ['P2Y', '2 years', '2 év'],
    'hours' => ['PT24H', '24 hours', '24 óra'],
    'year and months' => ['P1Y6M', '1 year 6 months', '1 év 6 hónap'],
    'weeks only when written' => ['P2W', '2 weeks', '2 hét'],
]);
