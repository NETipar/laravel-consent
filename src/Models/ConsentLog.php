<?php

declare(strict_types=1);

namespace NETipar\Consent\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use NETipar\Consent\Config\ConsentConfig;

/**
 * One append-only proof-of-consent event (GDPR Art. 7(1)).
 *
 * @property int $id
 * @property string $event_id
 * @property string $consent_id
 * @property string $action
 * @property list<string> $granted
 * @property string $version
 * @property string|null $url
 * @property string|null $ip_hash
 * @property string|null $user_agent
 * @property string|null $user_id
 * @property CarbonImmutable $created_at
 */
final class ConsentLog extends Model
{
    use MassPrunable;

    public $timestamps = false;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'event_id',
        'consent_id',
        'action',
        'granted',
        'version',
        'url',
        'ip_hash',
        'user_agent',
        'user_id',
        'created_at',
    ];

    /**
     * @var array<string, string>
     */
    protected $casts = [
        'granted' => 'array',
        'created_at' => 'immutable_datetime',
    ];

    public function getTable(): string
    {
        return app(ConsentConfig::class)->logTable;
    }

    public function getConnectionName(): ?string
    {
        return app(ConsentConfig::class)->logConnection;
    }

    /**
     * Rows older than the configured retention window.
     *
     * @return Builder<static>
     */
    public function prunable(): Builder
    {
        return self::query()->where('created_at', '<', now()->subDays(app(ConsentConfig::class)->logRetentionDays));
    }
}
