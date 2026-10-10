<?php

declare(strict_types=1);

namespace NETipar\Consent\Facades;

use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Facade;
use NETipar\Consent\Category;
use NETipar\Consent\ConsentDecision;
use NETipar\Consent\ConsentManager;
use NETipar\Consent\Models\ConsentLog;

/**
 * @method static list<Category> categories()
 * @method static string version()
 * @method static string cookieName()
 * @method static string versionCookieName()
 * @method static ConsentDecision decision(?Request $request = null)
 * @method static bool hasDecision(?Request $request = null)
 * @method static bool allows(string $category, ?Request $request = null)
 * @method static list<string> granted(?Request $request = null)
 * @method static string|null policyUrl()
 * @method static array<string, string> texts()
 * @method static array<string, mixed> clientConfig()
 * @method static list<array{key: string, label: string, description: string, required: bool, cookies: list<array{name: string, provider: ?string, purpose: ?string, lifetime: ?string, domain: ?string}>}> cookieTable()
 * @method static Collection<int, ConsentLog> history(string $consentId)
 * @method static string|null consentId(?Request $request = null)
 *
 * @see ConsentManager
 */
final class Consent extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return ConsentManager::class;
    }
}
