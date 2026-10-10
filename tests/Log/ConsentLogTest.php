<?php

declare(strict_types=1);

use Illuminate\Auth\GenericUser;
use Illuminate\Cookie\CookieValuePrefix;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use NETipar\Consent\ConsentServiceProvider;
use NETipar\Consent\Facades\Consent;
use NETipar\Consent\Models\ConsentLog;

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function logPayload(array $overrides = []): array
{
    return array_merge([
        'event_id' => (string) Str::uuid(),
        'consent_id' => (string) Str::uuid(),
        'action' => 'save',
        'granted' => ['analytics'],
        'version' => '1',
        'url' => '/kapcsolat',
    ], $overrides);
}

function logRow(): ConsentLog
{
    return ConsentLog::query()->firstOrFail();
}

describe('recording', function (): void {
    beforeEach(function (): void {
        $this->withoutMiddleware(ValidateCsrfToken::class);
    });

    it('stores a valid event and always grants required categories', function (): void {
        $payload = logPayload(['granted' => ['marketing']]);

        $this->withHeader('User-Agent', 'PestBrowser/1.0')
            ->postJson('/consent/log', $payload)
            ->assertNoContent();

        $row = logRow();

        expect(ConsentLog::query()->count())->toBe(1)
            ->and($row->event_id)->toBe($payload['event_id'])
            ->and($row->consent_id)->toBe($payload['consent_id'])
            ->and($row->action)->toBe('save')
            ->and($row->granted)->toBe(['necessary', 'marketing'])
            ->and($row->version)->toBe('1')
            ->and($row->url)->toBe('/kapcsolat')
            ->and($row->ip_hash)->toMatch('/^[0-9a-f]{64}$/')
            ->and($row->user_agent)->toBe('PestBrowser/1.0')
            ->and($row->user_id)->toBeNull()
            ->and($row->created_at->isToday())->toBeTrue();
    });

    it('accepts an empty selection and a missing url', function (): void {
        $this->postJson('/consent/log', logPayload(['action' => 'reject_all', 'granted' => [], 'url' => null]))
            ->assertNoContent();

        expect(logRow()->granted)->toBe(['necessary'])
            ->and(logRow()->url)->toBeNull();
    });

    it('is idempotent per event id', function (): void {
        $payload = logPayload();

        $this->postJson('/consent/log', $payload)->assertNoContent();
        $this->postJson('/consent/log', array_merge($payload, ['action' => 'withdraw']))->assertNoContent();

        expect(ConsentLog::query()->count())->toBe(1)
            ->and(logRow()->action)->toBe('save');
    });

    it('rejects invalid payloads', function (array $override): void {
        $this->postJson('/consent/log', logPayload($override))->assertUnprocessable();

        expect(ConsentLog::query()->count())->toBe(0);
    })->with([
        'unknown action' => [['action' => 'delete_everything']],
        'unknown category' => [['granted' => ['bogus']]],
        'non-uuid event id' => [['event_id' => 'not-a-uuid']],
        'non-uuid consent id' => [['consent_id' => 'not-a-uuid']],
        'missing version' => [['version' => '']],
        'granted not an array' => [['granted' => 'analytics']],
    ]);

    it('stores nulls when ip and user agent storage are disabled', function (): void {
        // Boot-time settings are untouched: only the per-request flags are read lazily.
        config(['consent.log.store_ip' => false, 'consent.log.store_user_agent' => false]);

        $this->postJson('/consent/log', logPayload())->assertNoContent();

        expect(logRow()->ip_hash)->toBeNull()
            ->and(logRow()->user_agent)->toBeNull();
    });

    it('truncates a long user agent to 255 characters', function (): void {
        $this->withHeader('User-Agent', str_repeat('a', 400))
            ->postJson('/consent/log', logPayload())
            ->assertNoContent();

        expect(logRow()->user_agent)->toHaveLength(255);
    });

    it('truncates the user agent to the configured length', function (): void {
        config(['consent.log.user_agent_max_length' => 40]);

        $this->withHeader('User-Agent', str_repeat('a', 400))
            ->postJson('/consent/log', logPayload())
            ->assertNoContent();

        expect(logRow()->user_agent)->toHaveLength(40);
    });

    it('stores a user agent with invalid UTF-8 as valid UTF-8', function (): void {
        $this->withHeader('User-Agent', "Mozilla/\xC3\x28 \xFF")
            ->postJson('/consent/log', logPayload())
            ->assertNoContent();

        expect(mb_check_encoding((string) logRow()->user_agent, 'UTF-8'))->toBeTrue();
    });

    it('stores the url pathname only', function (string $sent, string $stored): void {
        $this->postJson('/consent/log', logPayload(['url' => $sent]))->assertNoContent();

        expect(logRow()->url)->toBe($stored);
    })->with([
        'absolute with query and fragment' => ['https://x.test/a/b?token=1#f', '/a/b'],
        'relative with query' => ['/kapcsolat?email=a@b.hu', '/kapcsolat'],
        'no path' => ['https://x.test?token=1', '/'],
    ]);

    it('treats a differently cased event id as a replay and stores ids lowercase', function (): void {
        $payload = logPayload();

        $this->postJson('/consent/log', array_merge($payload, ['event_id' => strtoupper($payload['event_id']), 'consent_id' => strtoupper($payload['consent_id'])]))
            ->assertNoContent();
        $this->postJson('/consent/log', $payload)->assertNoContent();

        expect(ConsentLog::query()->count())->toBe(1)
            ->and(logRow()->event_id)->toBe($payload['event_id'])
            ->and(logRow()->consent_id)->toBe($payload['consent_id'])
            ->and(Consent::history(strtoupper($payload['consent_id'])))->toHaveCount(1);
    });

    it('stores no user id when the identifier exceeds the column', function (): void {
        $this->actingAs(new GenericUser(['id' => str_repeat('u', 65)]))
            ->postJson('/consent/log', logPayload())
            ->assertNoContent();

        expect(logRow()->user_id)->toBeNull();
    });

    it('records the authenticated user id', function (): void {
        $this->actingAs(new GenericUser(['id' => 42]))
            ->postJson('/consent/log', logPayload())
            ->assertNoContent();

        expect(logRow()->user_id)->toBe('42');
    });

    it('omits the user id when store_user_id is disabled', function (): void {
        config(['consent.log.store_user_id' => false]);

        $this->actingAs(new GenericUser(['id' => 42]))
            ->postJson('/consent/log', logPayload())
            ->assertNoContent();

        expect(logRow()->user_id)->toBeNull();
    });
});

it('rejects a request without a CSRF token', function (): void {
    // Laravel skips CSRF verification while the app environment is "testing".
    app()['env'] = 'production';

    $this->postJson('/consent/log', logPayload())->assertStatus(419);

    expect(ConsentLog::query()->count())->toBe(0);
});

describe('csrf', function (): void {
    beforeEach(function (): void {
        // Laravel skips CSRF verification while the app environment is "testing".
        app()['env'] = 'production';
    });

    it('accepts the session token in X-CSRF-TOKEN (meta tag path)', function (): void {
        $this->withSession(['_token' => 'session-token'])
            ->withHeader('X-CSRF-TOKEN', 'session-token')
            ->postJson('/consent/log', logPayload())
            ->assertNoContent();

        expect(ConsentLog::query()->count())->toBe(1);
    });

    it('accepts the encrypted XSRF-TOKEN cookie value in X-XSRF-TOKEN', function (): void {
        $encrypter = app('encrypter');
        $cookieValue = $encrypter->encrypt(CookieValuePrefix::create('XSRF-TOKEN', $encrypter->getKey()).'session-token', false);

        $this->withSession(['_token' => 'session-token'])
            ->withHeader('X-XSRF-TOKEN', $cookieValue)
            ->postJson('/consent/log', logPayload())
            ->assertNoContent();

        expect(ConsentLog::query()->count())->toBe(1);
    });

    it('rejects the plain token in X-XSRF-TOKEN (it must be the encrypted cookie value)', function (): void {
        $this->withSession(['_token' => 'session-token'])
            ->withHeader('X-XSRF-TOKEN', 'session-token')
            ->postJson('/consent/log', logPayload())
            ->assertStatus(419);

        expect(ConsentLog::query()->count())->toBe(0);
    });

    it('rejects a wrong token', function (): void {
        $this->withSession(['_token' => 'session-token'])
            ->withHeader('X-CSRF-TOKEN', 'other-token')
            ->postJson('/consent/log', logPayload())
            ->assertStatus(419);
    });
});

it('exposes the endpoint in the client config', function (): void {
    expect(freshConsent()->clientConfig()['log'])->toBe([
        'endpoint' => '/consent/log',
        'idCookieName' => '__cookie_consent_id',
    ]);
});

it('lists the registered route', function (): void {
    expect(route('consent.log', absolute: false))->toBe('/consent/log');
});

describe('history', function (): void {
    it('returns one visitor\'s events oldest first', function (): void {
        $id = (string) Str::uuid();

        foreach ([['save', '-2 days'], ['accept_all', '-5 days'], ['withdraw', '-1 day']] as [$action, $when]) {
            ConsentLog::query()->create(logPayload([
                'consent_id' => $id,
                'action' => $action,
                'granted' => ['necessary'],
                'created_at' => now()->modify($when),
            ]));
        }
        ConsentLog::query()->create(logPayload(['granted' => ['necessary'], 'created_at' => now()]));

        expect(Consent::history($id)->pluck('action')->all())->toBe(['accept_all', 'save', 'withdraw']);
    });

    it('rejects a non-uuid consent id', function (): void {
        Consent::history('nope');
    })->throws(InvalidArgumentException::class);

    it('reads the consent id from the raw cookie header', function (): void {
        $id = (string) Str::uuid();
        $request = Request::create('/');

        $request->headers->set('Cookie', "other=1; __cookie_consent_id={$id}");
        expect(Consent::consentId($request))->toBe($id);

        $request->headers->set('Cookie', '__cookie_consent_id=not-a-uuid');
        expect(Consent::consentId($request))->toBeNull();

        $request->headers->remove('Cookie');
        expect(Consent::consentId($request))->toBeNull();
    });
});

describe('storage', function (): void {
    it('creates the table with its indexes', function (): void {
        $indexes = collect(Schema::getIndexes('consent_logs'));

        $find = fn (array $columns) => $indexes->first(fn (array $index): bool => $index['columns'] === $columns);

        expect(Schema::hasTable('consent_logs'))->toBeTrue()
            ->and($find(['event_id'])['unique'] ?? null)->toBeTrue()
            ->and($find(['consent_id', 'created_at']))->not->toBeNull()
            ->and($find(['created_at']))->not->toBeNull()
            ->and($find(['user_id']))->not->toBeNull();
    });

    it('prunes rows past the retention window only', function (): void {
        ConsentLog::query()->create(logPayload(['granted' => ['necessary'], 'created_at' => now()->subDays(1096)]));
        $recent = ConsentLog::query()->create(logPayload(['granted' => ['necessary'], 'created_at' => now()->subDays(10)]));

        $this->artisan('model:prune', ['--model' => [ConsentLog::class]])->assertSuccessful();

        expect(ConsentLog::query()->pluck('id')->all())->toBe([$recent->id]);
    });

    it('honours the configured table and connection in the migration', function (): void {
        config([
            'database.connections.audit' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => ''],
            'consent.log.connection' => 'audit',
            'consent.log.table' => 'audit_consents',
        ]);
        $migration = require __DIR__.'/../../database/migrations/2026_10_09_000000_create_consent_logs_table.php';

        expect($migration->getConnection())->toBe('audit');

        // Like the migrator: the migration's own connection becomes the default while it runs.
        $migrator = app('migrator');
        $migrator->usingConnection($migration->getConnection(), fn () => $migration->up());

        expect(Schema::connection('audit')->hasTable('audit_consents'))->toBeTrue()
            ->and(Schema::hasTable('audit_consents'))->toBeFalse();

        $migrator->usingConnection($migration->getConnection(), fn () => $migration->down());

        expect(Schema::connection('audit')->hasTable('audit_consents'))->toBeFalse();
    });

    it('publishes the migration under the same filename, so the migrator runs it once', function (): void {
        $name = '2026_10_09_000000_create_consent_logs_table';
        $published = ServiceProvider::pathsToPublish(ConsentServiceProvider::class, 'consent-migrations');

        expect(array_values($published))->toBe([database_path('migrations')]);

        $copy = sys_get_temp_dir().'/consent-'.Str::uuid();
        File::ensureDirectoryExists($copy);

        try {
            File::copy(__DIR__."/../../database/migrations/{$name}.php", "{$copy}/{$name}.php");

            $migrator = app('migrator');
            $files = $migrator->getMigrationFiles([...$migrator->paths(), $copy]);

            expect(array_filter(array_keys($files), fn (string $key): bool => $key === $name))->toHaveCount(1);
        } finally {
            File::deleteDirectory($copy);
        }
    });
});
