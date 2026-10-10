<?php

declare(strict_types=1);

namespace NETipar\Consent;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Contracts\Config\Repository;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use NETipar\Consent\Config\ConsentConfig;
use NETipar\Consent\Cookies\ConsentCookieReader;

class ConsentServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../config/consent.php', 'consent');

        // Bound, not shared: reflects config overrides made after the first resolution.
        $this->app->bind(ConsentConfig::class, function (Application $app): ConsentConfig {
            $config = $app->make(Repository::class)->get('consent', []);

            return ConsentConfig::fromArray(is_array($config) ? $config : []);
        });
        $this->app->bind(ConsentCookieReader::class);
        $this->app->singleton(ConsentManager::class, fn (Application $app): ConsentManager => new ConsentManager(
            $app->make(ConsentConfig::class),
            fn (): Request => $app->make(Request::class),
        ));
    }

    public function boot(): void
    {
        $config = $this->app->make(ConsentConfig::class);

        $this->loadViewsFrom(__DIR__.'/../resources/views', 'consent');
        $this->loadTranslationsFrom(__DIR__.'/../lang', 'consent');

        Blade::anonymousComponentPath(__DIR__.'/../resources/views/components', 'consent');
        Blade::if('consent', fn (string $category): bool => $this->app->make(ConsentManager::class)->allows($category));
        Blade::directive('consentConfig', fn (): string => "<?php echo '<script type=\"application/json\" id=\"consent-config\">'.json_encode(app(\\NETipar\\Consent\\ConsentManager::class)->clientConfig(), JSON_HEX_TAG|JSON_HEX_AMP|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR).'</script>'; ?>");

        if ($config->logEnabled) {
            $this->registerConsentLog($config);
        }

        if ($this->app->runningInConsole()) {
            $this->registerPublishing();
        }
    }

    /**
     * The route prefix, middleware and rate limit are fixed at boot: changing the
     * `consent.log` config afterwards needs an application reboot.
     */
    private function registerConsentLog(ConsentConfig $config): void
    {
        $this->loadMigrationsFrom(__DIR__.'/../database/migrations');

        RateLimiter::for('consent-log', fn (Request $request): Limit => Limit::perMinute($config->logThrottlePerMinute)->by($request->ip() ?? 'unknown'));

        Route::group(
            ['prefix' => $config->logRoutePrefix, 'middleware' => $config->logRouteMiddleware],
            fn () => $this->loadRoutesFrom(__DIR__.'/../routes/consent.php'),
        );
    }

    private function registerPublishing(): void
    {
        $this->publishes([
            __DIR__.'/../config/consent.php' => config_path('consent.php'),
        ], 'consent-config');

        $this->publishes([
            __DIR__.'/../resources/views' => resource_path('views/vendor/consent'),
        ], 'consent-views');

        $this->publishes([
            __DIR__.'/../lang' => lang_path('vendor/consent'),
        ], 'consent-lang');

        $this->publishes([
            __DIR__.'/../database/migrations' => database_path('migrations'),
        ], 'consent-migrations');
    }
}
