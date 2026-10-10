<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Blade;

function renderBanner(string $template = '<x-consent::banner />', array $cookies = []): string
{
    $cookie = collect($cookies)->map(fn (string $value, string $name): string => "{$name}={$value}")->implode('; ');

    $request = Request::create('/', server: $cookie === '' ? [] : ['HTTP_COOKIE' => $cookie]);
    app()->instance('request', $request);
    Illuminate\Support\Facades\Request::swap($request);

    return Blade::render($template);
}

/**
 * The opening tag of the first element of the given type.
 */
function openingTag(string $html, string $element): string
{
    preg_match('/<'.$element.'\b[^>]*>/', $html, $matches);

    return $matches[0] ?? '';
}

/**
 * @return array<string, string>
 */
function validCookies(string $version = '1'): array
{
    return ['__cookie_consent' => 'necessary%2Canalytics', '__cookie_consent_v' => $version];
}

it('renders the accessible default markup', function (): void {
    $html = renderBanner();

    expect($html)
        ->toContain('role="dialog"')
        ->toContain('aria-modal="false"')
        ->toContain('aria-labelledby="consent-title"')
        ->toContain('aria-describedby="consent-description"')
        ->toContain('x-data="consentBanner"')
        ->toContain('<dialog')
        ->toContain('aria-labelledby="consent-settings-title"')
        ->not->toContain('class=');
});

it('renders the three first-layer and two settings buttons as type=button', function (): void {
    $html = renderBanner();

    preg_match_all('/<button\b[^>]*>/', $html, $matches);

    expect($matches[0])->toHaveCount(5)
        ->each->toContain('type="button"');
});

it('leaves the prompt visible for visitors without a decision', function (): void {
    expect(openingTag(renderBanner(), 'section'))->not->toMatch('/\shidden(\s|>)/');
});

it('hides the prompt server-side when a valid decision exists', function (): void {
    expect(openingTag(renderBanner(cookies: validCookies()), 'section'))->toMatch('/\shidden(\s|>)/');
});

it('shows the prompt again when the stored version is stale', function (): void {
    expect(openingTag(renderBanner(cookies: validCookies('0')), 'section'))->not->toMatch('/\shidden(\s|>)/');
});

it('locks the required category checkbox and leaves optional ones editable', function (): void {
    $html = renderBanner();

    preg_match('/<input\b[^>]*consent-category-necessary[^>]*>/', $html, $necessary);
    preg_match('/<input\b[^>]*consent-category-analytics[^>]*>/', $html, $analytics);

    expect($necessary[0])->toContain('checked')->toContain('disabled')
        ->and($analytics[0])->not->toContain('checked')->not->toContain('disabled')
        ->and($analytics[0])->toContain("x-model=\"selection['analytics']\"");
});

it('replaces the fallback with custom slot content', function (): void {
    $html = renderBanner('<x-consent::banner><p>Custom prompt</p></x-consent::banner>');

    expect($html)->toContain('Custom prompt')
        ->not->toContain('id="consent-title"')
        ->not->toContain('Accept all');
});

it('replaces the settings fallback with the settings slot', function (): void {
    $html = renderBanner('<x-consent::banner><x-slot:settings><p>Custom settings</p></x-slot:settings></x-consent::banner>');

    expect($html)->toContain('Custom settings')
        ->not->toContain('id="consent-settings-title"')
        ->toContain('Accept all');
});

it('merges passed attributes onto the section and the settings slot attributes onto the dialog', function (): void {
    $html = renderBanner('<x-consent::banner class="x"><x-slot:settings class="y">Body</x-slot:settings></x-consent::banner>');

    expect(openingTag($html, 'section'))->toContain('class="x"')->not->toContain('class="y"')
        ->and(openingTag($html, 'dialog'))->toContain('class="y"')->not->toContain('class="x"');
});

it('accepts prop overrides and the policy link', function (): void {
    config(['consent.policy_url' => '/privacy']);
    freshConsent();

    $html = renderBanner('<x-consent::banner title="Hello" description="World" policy-url="/p" policy-label="Read" />');

    expect($html)->toContain('>Hello</h2>')->toContain('World')->toContain('<a href="/p">Read</a>');
});

it('uses the configured policy url by default and omits the link without one', function (): void {
    config(['consent.policy_url' => '/privacy']);
    freshConsent();
    expect(renderBanner())->toContain('<a href="/privacy">Cookie policy</a>');

    config(['consent.policy_url' => null]);
    freshConsent();
    expect(renderBanner())->not->toContain('<a ');
});

it('escapes prop values', function (): void {
    expect(renderBanner('<x-consent::banner title="<b>x</b>" />'))->toContain('&lt;b&gt;x&lt;/b&gt;');
});

it('renders in the current locale', function (string $locale, string $title, string $category): void {
    app()->setLocale($locale);

    expect(renderBanner())->toContain($title)->toContain($category);
})->with([
    'hu' => ['hu', 'Sütiket használunk', 'Analitika'],
    'de' => ['de', 'Wir verwenden Cookies', 'Analyse'],
]);
