<?php

declare(strict_types=1);

namespace NETipar\Consent;

use Closure;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use InvalidArgumentException;
use NETipar\Consent\Config\ConsentConfig;
use NETipar\Consent\Cookies\ConsentCookieReader;
use NETipar\Consent\CookieTable\CookieTableBuilder;
use NETipar\Consent\Exceptions\LogDisabledException;
use NETipar\Consent\Exceptions\UnknownCategoryException;
use NETipar\Consent\Models\ConsentLog;

class ConsentManager
{
    private const array TEXT_KEYS = [
        'title' => 'title',
        'description' => 'description',
        'policy' => 'policy',
        'acceptAll' => 'accept_all',
        'rejectAll' => 'reject_all',
        'settings' => 'settings',
        'settingsTitle' => 'settings_title',
        'settingsIntro' => 'settings_intro',
        'save' => 'save',
        'cancel' => 'cancel',
    ];

    private readonly ConsentCookieReader $reader;

    /**
     * @param  Closure(): Request  $requestResolver
     */
    public function __construct(
        private readonly ConsentConfig $config,
        private readonly Closure $requestResolver,
    ) {
        $this->reader = new ConsentCookieReader($config);
    }

    /**
     * @return list<Category>
     */
    public function categories(): array
    {
        return $this->config->categories;
    }

    public function version(): string
    {
        return $this->config->version;
    }

    public function cookieName(): string
    {
        return $this->config->cookieName;
    }

    public function versionCookieName(): string
    {
        return $this->config->versionCookieName;
    }

    /**
     * The visitor's decision, or none() when it is missing or belongs to another config version.
     */
    public function decision(?Request $request = null): ConsentDecision
    {
        $decision = $this->reader->read($request ?? $this->currentRequest());

        return $decision->isValidFor($this->config) ? $decision : ConsentDecision::none();
    }

    public function hasDecision(?Request $request = null): bool
    {
        return $this->decision($request)->version !== null;
    }

    /**
     * @throws UnknownCategoryException
     */
    public function allows(string $category, ?Request $request = null): bool
    {
        $definition = $this->config->category($category)
            ?? throw UnknownCategoryException::named($category, $this->config->keys());

        if ($definition->required) {
            return true;
        }

        return in_array($category, $this->decision($request)->granted, true);
    }

    /**
     * @return list<string>
     */
    public function granted(?Request $request = null): array
    {
        return $this->config->normaliseGranted($this->decision($request)->granted);
    }

    /**
     * Every recorded consent event of one visitor, oldest first (D26).
     *
     * @return Collection<int, ConsentLog>
     *
     * @throws LogDisabledException
     * @throws InvalidArgumentException
     */
    public function history(string $consentId): Collection
    {
        if (! $this->config->logEnabled) {
            throw LogDisabledException::disabled();
        }

        if (! Str::isUuid($consentId)) {
            throw new InvalidArgumentException('The consent id must be a UUID.');
        }

        return ConsentLog::query()
            ->where('consent_id', Str::lower($consentId))
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();
    }

    /**
     * The visitor's consent id (raw `Cookie` header, UUID-validated) or null.
     */
    public function consentId(?Request $request = null): ?string
    {
        $value = $this->reader->readRaw($request ?? $this->currentRequest(), $this->config->logIdCookieName);

        return $value !== null && Str::isUuid($value) ? $value : null;
    }

    /**
     * Resolved per request: a locale map picks the current locale (then the fallback
     * locale), a string that names a registered route becomes that route's URL,
     * anything else is returned verbatim.
     */
    public function policyUrl(): ?string
    {
        $policyUrl = $this->config->policyUrl;

        if (is_array($policyUrl)) {
            $fallback = config('app.fallback_locale');

            return $policyUrl[app()->getLocale()]
                ?? (is_string($fallback) ? ($policyUrl[$fallback] ?? null) : null);
        }

        if ($policyUrl !== null && Route::has($policyUrl)) {
            return route($policyUrl);
        }

        return $policyUrl;
    }

    /**
     * @return array<string, string>
     */
    public function texts(): array
    {
        $texts = [];

        foreach (self::TEXT_KEYS as $key => $lang) {
            $id = "consent::consent.banner.{$lang}";
            $line = trans($id);

            // A locale (or published override) without this line falls back to the package's English default.
            if (! is_string($line) || $line === $id) {
                $line = trans($id, [], 'en');
            }

            $texts[$key] = is_string($line) && $line !== $id ? $line : '';
        }

        return $texts;
    }

    /**
     * The cookie table for the policy page (D27): every category in config order with only its
     * rich (listed) cookies, resolved for the current locale. Not part of `clientConfig()`.
     *
     * @return list<array{key: string, label: string, description: string, required: bool, cookies: list<array{name: string, provider: ?string, purpose: ?string, lifetime: ?string, domain: ?string}>}>
     */
    public function cookieTable(): array
    {
        $fallback = config('app.fallback_locale');

        return (new CookieTableBuilder($this->config->categories))
            ->build(app()->getLocale(), is_string($fallback) ? $fallback : 'en');
    }

    /**
     * The JSON document read by the JS core, resolved for the current locale.
     * Call it per request; never cache the result across locales.
     *
     * @return array<string, mixed>
     */
    public function clientConfig(): array
    {
        return [
            'version' => $this->config->version,
            'cookie' => [
                'name' => $this->config->cookieName,
                'versionName' => $this->config->versionCookieName,
                'lifetimeDays' => $this->config->lifetimeDays,
                'domain' => $this->config->domain,
                'sameSite' => $this->config->sameSite,
                'secure' => $this->config->secure,
            ],
            'categories' => array_map(static fn (Category $category): array => [
                'key' => $category->key,
                'required' => $category->required,
                'label' => $category->label(),
                'description' => $category->description(),
                'cookies' => $category->cookieNames(),
            ], $this->config->categories),
            'texts' => $this->texts(),
            'reloadOnRevoke' => $this->config->reloadOnRevoke,
            'log' => $this->config->logEnabled ? [
                'endpoint' => '/'.trim($this->config->logRoutePrefix, '/').'/log',
                'idCookieName' => $this->config->logIdCookieName,
            ] : null,
            'policyUrl' => $this->policyUrl(),
            'google' => $this->config->googleTags === [] ? null : [
                'tags' => $this->config->googleTags,
                'signals' => $this->config->googleSignals,
                'adsDataRedaction' => $this->config->adsDataRedaction,
                'urlPassthrough' => $this->config->urlPassthrough,
            ],
        ];
    }

    private function currentRequest(): Request
    {
        return ($this->requestResolver)();
    }
}
