<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use NETipar\Consent\Config\ConsentConfig;
use NETipar\Consent\Cookies\ConsentCookieReader;

/**
 * @param  list<string>  $cookieHeaders
 */
function consentRequest(array $cookieHeaders = []): Request
{
    $request = Request::create('/');

    foreach ($cookieHeaders as $header) {
        $request->headers->set('Cookie', $header, false);
    }

    return $request;
}

function consentReader(): ConsentCookieReader
{
    return new ConsentCookieReader(ConsentConfig::fromArray(consentConfigWith()));
}

it('reads the granted categories and the version', function (): void {
    $decision = consentReader()->read(consentRequest(['__cookie_consent=necessary%2Cmarketing; __cookie_consent_v=1']));

    expect($decision->granted)->toBe(['necessary', 'marketing'])
        ->and($decision->version)->toBe('1');
});

it('reads quoted values', function (): void {
    $decision = consentReader()->read(consentRequest(['__cookie_consent="necessary%2Canalytics"; __cookie_consent_v="1"']));

    expect($decision->granted)->toBe(['necessary', 'analytics'])
        ->and($decision->version)->toBe('1');
});

it('joins several Cookie headers', function (): void {
    $decision = consentReader()->read(consentRequest(['__cookie_consent=necessary%2Canalytics', '__cookie_consent_v=1']));

    expect($decision->granted)->toBe(['necessary', 'analytics'])
        ->and($decision->version)->toBe('1');
});

it('filters unknown categories, blanks and duplicates', function (): void {
    $decision = consentReader()->read(consentRequest(['__cookie_consent=necessary%2Cfoo%2C%20analytics%20%2C%2Cnecessary; __cookie_consent_v=1']));

    expect($decision->granted)->toBe(['necessary', 'analytics']);
});

it('ignores malformed pairs and keeps the first occurrence of a cookie', function (): void {
    $decision = consentReader()->read(consentRequest(['junk; =x; __cookie_consent=necessary; __cookie_consent=necessary%2Cmarketing; __cookie_consent_v=1']));

    expect($decision->granted)->toBe(['necessary']);
});

it('keeps the first of two same-named cookies when no cookie domain is set', function (): void {
    // Without `cookie.domain` the package only writes host-only cookies and the JS core removes
    // same-host duplicates on every decision, so the first one in the header is used.
    $decision = consentReader()->read(consentRequest(['__cookie_consent=necessary; __cookie_consent_v=1; __cookie_consent=necessary%2Cmarketing; __cookie_consent_v=2']));

    expect($decision->granted)->toBe(['necessary'])
        ->and($decision->version)->toBe('1');
});

it('returns none for duplicate value cookies when a cookie domain is set', function (): void {
    // A legacy host-only copy (older, sent first) next to the Domain cookie of a fresh rejection:
    // the header cannot tell which is newer, so no decision until the JS core cleans the copy up.
    $reader = new ConsentCookieReader(ConsentConfig::fromArray(consentConfigWith('cookie.domain', '.example.com')));

    $decision = $reader->read(consentRequest(['__cookie_consent=necessary%2Canalytics%2Cmarketing; __cookie_consent=necessary; __cookie_consent_v=1']));

    expect($decision->granted)->toBe([])
        ->and($decision->version)->toBeNull();
});

it('reads a single value cookie normally when a cookie domain is set', function (): void {
    $reader = new ConsentCookieReader(ConsentConfig::fromArray(consentConfigWith('cookie.domain', '.example.com')));

    $decision = $reader->read(consentRequest(['__cookie_consent=necessary%2Cmarketing; __cookie_consent_v=1; __cookie_consent_v=1']));

    expect($decision->granted)->toBe(['necessary', 'marketing'])
        ->and($decision->version)->toBe('1');
});

it('returns none without a Cookie header', function (): void {
    $decision = consentReader()->read(consentRequest());

    expect($decision->granted)->toBe([])
        ->and($decision->version)->toBeNull();
});

it('returns a null version when only the value cookie exists', function (): void {
    $decision = consentReader()->read(consentRequest(['__cookie_consent=necessary%2Cmarketing']));

    expect($decision->granted)->toBe(['necessary', 'marketing'])
        ->and($decision->version)->toBeNull();
});

it('returns none when only the version cookie exists', function (): void {
    $decision = consentReader()->read(consentRequest(['__cookie_consent_v=1']));

    expect($decision->version)->toBeNull()
        ->and($decision->granted)->toBe([]);
});
