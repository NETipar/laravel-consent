<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\File;
use NETipar\Consent\ConsentManager;

/**
 * @param  array<string, mixed>  $lines
 * @return list<string>
 */
function flattenedKeys(array $lines, string $prefix = ''): array
{
    $keys = [];

    foreach ($lines as $key => $value) {
        $path = $prefix.$key;
        $keys = [...$keys, ...(is_array($value) ? flattenedKeys($value, $path.'.') : [$path])];
    }

    sort($keys);

    return $keys;
}

it('ships the same key tree in every locale', function (string $locale): void {
    $reference = require __DIR__.'/../../lang/en/consent.php';
    $lines = require __DIR__."/../../lang/{$locale}/consent.php";

    expect(flattenedKeys($lines))->toBe(flattenedKeys($reference));
})->with(['hu', 'de', 'es', 'fr']);

it('lets a published override replace the package lines', function (): void {
    $path = lang_path('vendor/consent/en/consent.php');
    File::ensureDirectoryExists(dirname($path));
    File::put($path, "<?php\n\nreturn ['banner' => ['title' => 'Custom title']];\n");

    try {
        app()->setLocale('en');
        freshConsent();
        app('translator')->setLoaded([]);

        expect(Blade::render('<x-consent::banner />'))->toContain('>Custom title</h2>')
            ->and(app(ConsentManager::class)->clientConfig()['texts']['title'])->toBe('Custom title');
    } finally {
        File::delete($path);
        File::deleteDirectory(lang_path('vendor/consent'));
        File::deleteDirectory(lang_path('vendor'));
        app('translator')->setLoaded([]);
    }
});

it('falls back to the package English line when the locale and its override lack a key', function (): void {
    $path = lang_path('vendor/consent/nl/consent.php');
    File::ensureDirectoryExists(dirname($path));
    File::put($path, "<?php\n\nreturn ['banner' => ['title' => 'Eigen titel']];\n");

    try {
        config(['app.fallback_locale' => 'nl']);
        app()->setLocale('nl');
        freshConsent();
        app('translator')->setLoaded([]);
        app('translator')->setFallback('nl');

        $texts = app(ConsentManager::class)->texts();

        expect($texts['title'])->toBe('Eigen titel')
            ->and($texts['acceptAll'])->toBe('Accept all')
            ->and($texts)->each->not->toContain('consent::');
    } finally {
        File::delete($path);
        File::deleteDirectory(lang_path('vendor/consent'));
        File::deleteDirectory(lang_path('vendor'));
        app('translator')->setLoaded([]);
    }
});
