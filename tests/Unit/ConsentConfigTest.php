<?php

declare(strict_types=1);

use Illuminate\Support\Arr;
use NETipar\Consent\Config\ConsentConfig;
use NETipar\Consent\CookieTable\CookieEntry;
use NETipar\Consent\Exceptions\InvalidConfigurationException;

it('parses the package defaults', function (): void {
    $config = ConsentConfig::fromArray(consentConfigWith());

    expect($config->version)->toBe('1')
        ->and($config->cookieName)->toBe('__cookie_consent')
        ->and($config->versionCookieName)->toBe('__cookie_consent_v')
        ->and($config->lifetimeDays)->toBe(365)
        ->and($config->domain)->toBeNull()
        ->and($config->sameSite)->toBe('Lax')
        ->and($config->secure)->toBeNull()
        ->and($config->keys())->toBe(['necessary', 'analytics', 'marketing'])
        ->and($config->requiredKeys())->toBe(['necessary'])
        ->and($config->category('analytics')?->required)->toBeFalse()
        ->and($config->category('nope'))->toBeNull()
        ->and($config->reloadOnRevoke)->toBeTrue()
        ->and($config->policyUrl)->toBeNull()
        ->and($config->googleTags)->toBe([])
        ->and($config->googleSignals)->toHaveCount(4)
        ->and($config->adsDataRedaction)->toBeFalse()
        ->and($config->urlPassthrough)->toBeFalse()
        ->and($config->logEnabled)->toBeFalse()
        ->and($config->logRetentionDays)->toBe(365)
        ->and($config->logRouteMiddleware)->toBe(['web'])
        ->and($config->logUserAgentMaxLength)->toBe(255);
});

it('parses valid cookie lists into the category', function (): void {
    $config = ConsentConfig::fromArray(consentConfigWith('categories.analytics.cookies', ['_ga', '_ga_*']));

    expect($config->category('analytics')?->cookieNames())->toBe(['_ga', '_ga_*'])
        ->and($config->category('analytics')?->cookies)->each->toBeInstanceOf(CookieEntry::class);
});

it('treats a plain string cookie as purge-only and unlisted', function (): void {
    $entry = ConsentConfig::fromArray(consentConfigWith('categories.analytics.cookies', ['_ga']))->category('analytics')?->cookies[0];

    expect($entry?->name)->toBe('_ga')
        ->and($entry?->listed)->toBeFalse()
        ->and($entry?->provider)->toBeNull()
        ->and($entry?->purpose)->toBeNull();
});

it('parses a rich cookie entry', function (): void {
    $config = ConsentConfig::fromArray(consentConfigWith('categories.analytics.cookies', [
        '_gid',
        ['name' => '_ga', 'provider' => 'Google Analytics', 'purpose' => ['hu' => 'Mérés', 'en' => 'Measurement'], 'lifetime' => 'P2Y', 'domain' => '.example.com'],
        ['name' => '_gat_*'],
    ]));
    $analytics = $config->category('analytics');

    expect($analytics?->cookieNames())->toBe(['_gid', '_ga', '_gat_*'])
        ->and($analytics?->listedCookies())->toHaveCount(2)
        ->and($analytics?->cookies[1])->toEqual(new CookieEntry('_ga', true, 'Google Analytics', ['hu' => 'Mérés', 'en' => 'Measurement'], 'P2Y', '.example.com'))
        ->and($analytics?->cookies[2]->listed)->toBeTrue()
        ->and($analytics?->cookies[2]->lifetime)->toBeNull();
});

it('accepts cookies on a required category', function (): void {
    $config = ConsentConfig::fromArray(consentConfigWith('categories.necessary.cookies', [
        ['name' => 'laravel_session', 'lifetime' => 'session'],
    ]));

    expect($config->category('necessary')?->listedCookies())->toHaveCount(1);
});

it('accepts session and ISO 8601 lifetimes', function (string $lifetime): void {
    $config = ConsentConfig::fromArray(consentConfigWith('categories.analytics.cookies', [['name' => '_ga', 'lifetime' => $lifetime]]));

    expect($config->category('analytics')?->cookies[0]->lifetime)->toBe($lifetime);
})->with(['session', 'P2Y', 'PT24H', 'PT1M', 'P90D', 'P1Y6M', 'P1W']);

it('accepts a user agent length within the column width', function (int $length): void {
    expect(ConsentConfig::fromArray(consentConfigWith('log.user_agent_max_length', $length))->logUserAgentMaxLength)->toBe($length);
})->with([1, 100, 255]);

it('defaults the user agent length to 255 for a log block without the key', function (): void {
    $input = consentConfigWith();
    unset($input['log']['user_agent_max_length']);

    expect(ConsentConfig::fromArray($input)->logUserAgentMaxLength)->toBe(255);
});

it('accepts a locale map and a valid google tag setup', function (): void {
    $input = consentConfigWith('policy_url', ['hu' => '/suti', 'en' => '/cookies']);
    $input['google']['tags'] = [['id' => 'G-8B396W54EK', 'category' => 'analytics']];

    $config = ConsentConfig::fromArray($input);

    expect($config->policyUrl)->toBe(['hu' => '/suti', 'en' => '/cookies'])
        ->and($config->googleTags)->toBe([['id' => 'G-8B396W54EK', 'category' => 'analytics']]);
});

it('rejects invalid configuration and names the offending key', function (string $path, mixed $value, string $key): void {
    expect(fn () => ConsentConfig::fromArray(consentConfigWith($path, $value)))
        ->toThrow(InvalidConfigurationException::class, $key);
})->with([
    'version empty' => ['version', '', 'consent.version'],
    'cookie name' => ['cookie.name', 'bad name', 'consent.cookie.name'],
    'version cookie name' => ['cookie.version_name', '', 'consent.cookie.version_name'],
    'lifetime zero' => ['cookie.lifetime_days', 0, 'consent.cookie.lifetime_days'],
    'lifetime too long' => ['cookie.lifetime_days', 731, 'consent.cookie.lifetime_days'],
    'domain not a string' => ['cookie.domain', 5, 'consent.cookie.domain'],
    'domain empty' => ['cookie.domain', '', 'consent.cookie.domain'],
    'domain with a cookie attribute' => ['cookie.domain', 'example.com; Secure', 'consent.cookie.domain'],
    'domain with a scheme' => ['cookie.domain', 'https://example.com', 'consent.cookie.domain'],
    'domain with a port' => ['cookie.domain', 'example.com:8080', 'consent.cookie.domain'],
    'domain with a space' => ['cookie.domain', 'exam ple.com', 'consent.cookie.domain'],
    'domain with an empty label' => ['cookie.domain', 'example..com', 'consent.cookie.domain'],
    'domain with a trailing dot' => ['cookie.domain', 'example.com.', 'consent.cookie.domain'],
    'domain with two leading dots' => ['cookie.domain', '..example.com', 'consent.cookie.domain'],
    'domain label starting with a hyphen' => ['cookie.domain', '-example.com', 'consent.cookie.domain'],
    'same_site' => ['cookie.same_site', 'Weird', 'consent.cookie.same_site'],
    'secure' => ['cookie.secure', 'yes', 'consent.cookie.secure'],
    'categories empty' => ['categories', [], 'consent.categories'],
    'category key' => ['categories', ['Analytics' => ['required' => true]], 'consent.categories.Analytics'],
    'category definition' => ['categories', ['necessary' => true], 'consent.categories.necessary'],
    'category required flag' => ['categories.necessary.required', 'yes', 'consent.categories.necessary.required'],
    'no required category' => ['categories', ['analytics' => ['required' => false]], 'consent.categories'],
    'cookies not a list' => ['categories.analytics.cookies', '_ga', 'consent.categories.analytics.cookies'],
    'cookie wildcard not trailing' => ['categories.analytics.cookies', ['_ga*_'], 'consent.categories.analytics.cookies'],
    'cookie duplicated' => ['categories.analytics.cookies', ['_ga', '_ga'], 'consent.categories.analytics.cookies'],
    'cookie entry type' => ['categories.analytics.cookies', [5], 'consent.categories.analytics.cookies'],
    'rich cookie without name' => ['categories.analytics.cookies', [['provider' => 'Google']], 'consent.categories.analytics.cookies.0.name'],
    'rich cookie bad name' => ['categories.analytics.cookies', [['name' => 'bad name']], 'consent.categories.analytics.cookies.0.name'],
    'rich cookie provider too long' => ['categories.analytics.cookies', [['name' => '_ga', 'provider' => str_repeat('a', 121)]], 'consent.categories.analytics.cookies.0.provider'],
    'rich cookie provider type' => ['categories.analytics.cookies', [['name' => '_ga', 'provider' => 5]], 'consent.categories.analytics.cookies.0.provider'],
    'rich cookie lifetime words' => ['categories.analytics.cookies', [['name' => '_ga', 'lifetime' => '2 years']], 'consent.categories.analytics.cookies.0.lifetime'],
    'rich cookie lifetime empty duration' => ['categories.analytics.cookies', [['name' => '_ga', 'lifetime' => 'P']], 'consent.categories.analytics.cookies.0.lifetime'],
    'rich cookie lifetime time without digits' => ['categories.analytics.cookies', [['name' => '_ga', 'lifetime' => 'PT']], 'consent.categories.analytics.cookies.0.lifetime'],
    'rich cookie lifetime type' => ['categories.analytics.cookies', [['name' => '_ga', 'lifetime' => 365]], 'consent.categories.analytics.cookies.0.lifetime'],
    'rich cookie purpose map values' => ['categories.analytics.cookies', [['name' => '_ga', 'purpose' => ['hu' => 1]]], 'consent.categories.analytics.cookies.0.purpose'],
    'rich cookie purpose empty map' => ['categories.analytics.cookies', [['name' => '_ga', 'purpose' => []]], 'consent.categories.analytics.cookies.0.purpose'],
    'rich cookie purpose type' => ['categories.analytics.cookies', [['name' => '_ga', 'purpose' => 5]], 'consent.categories.analytics.cookies.0.purpose'],
    'rich cookie domain' => ['categories.analytics.cookies', [['name' => '_ga', 'domain' => 5]], 'consent.categories.analytics.cookies.0.domain'],
    'cookie duplicated across forms' => ['categories.analytics.cookies', ['_ga', ['name' => '_ga']], 'consent.categories.analytics.cookies'],
    'log.user_agent_max_length zero' => ['log.user_agent_max_length', 0, 'consent.log.user_agent_max_length'],
    'log.user_agent_max_length above the column' => ['log.user_agent_max_length', 256, 'consent.log.user_agent_max_length'],
    'log.user_agent_max_length type' => ['log.user_agent_max_length', '255', 'consent.log.user_agent_max_length'],
    'tag id' => ['google.tags', [['id' => 'XX-1', 'category' => 'analytics']], 'consent.google.tags'],
    'tag category unknown' => ['google.tags', [['id' => 'G-1', 'category' => 'nope']], 'consent.google.tags'],
    'tag category required' => ['google.tags', [['id' => 'G-1', 'category' => 'necessary']], 'consent.google.tags'],
    'tags not an array' => ['google.tags', 'G-1', 'consent.google.tags'],
    'signal category unknown' => ['google.signals.ad_storage', 'nope', 'consent.google.signals.ad_storage'],
    'signals extra key' => ['google.signals.extra', 'analytics', 'consent.google.signals'],
    'signals not an array' => ['google.signals', 'analytics', 'consent.google.signals'],
    'google section' => ['google', 'nope', 'consent.google'],
    'reload_on_revoke' => ['reload_on_revoke', 'yes', 'consent.reload_on_revoke'],
    'log.retention_days zero' => ['log.retention_days', 0, 'consent.log.retention_days'],
    'log.retention_days shorter than the consent' => ['log.retention_days', 200, 'consent.log.retention_days'],
    'log.route.throttle' => ['log.route.throttle', 0, 'consent.log.route.throttle'],
    'log.route.middleware' => ['log.route.middleware', 'web', 'consent.log.route.middleware'],
    'log.route.middleware item' => ['log.route.middleware', [1], 'consent.log.route.middleware'],
    'log.route.prefix' => ['log.route.prefix', 5, 'consent.log.route.prefix'],
    'log.table' => ['log.table', 'Consent Logs', 'consent.log.table'],
    'log.table too long' => ['log.table', str_repeat('a', 37), 'consent.log.table'],
    'log.connection' => ['log.connection', 5, 'consent.log.connection'],
    'log.store_ip' => ['log.store_ip', 'yes', 'consent.log.store_ip'],
    'policy_url locale map values' => ['policy_url', ['hu' => 1], 'consent.policy_url'],
    'policy_url locale map keys' => ['policy_url', ['/suti'], 'consent.policy_url'],
    'policy_url empty map' => ['policy_url', [], 'consent.policy_url'],
    'policy_url type' => ['policy_url', 5, 'consent.policy_url'],
]);

it('accepts a null, host or leading-dot cookie domain', function (?string $domain): void {
    expect(ConsentConfig::fromArray(consentConfigWith('cookie.domain', $domain))->domain)->toBe($domain);
})->with([
    'host-only' => [null],
    'registrable domain' => ['example.com'],
    'leading dot' => ['.example.com'],
    'subdomain with hyphen' => ['www.my-site.example.co.uk'],
    'single label' => ['localhost'],
]);

it('rejects a missing signal', function (): void {
    $input = consentConfigWith();
    Arr::forget($input, 'google.signals.ad_user_data');

    expect(fn () => ConsentConfig::fromArray($input))
        ->toThrow(InvalidConfigurationException::class, 'consent.google.signals is missing the "ad_user_data" signal');
});
