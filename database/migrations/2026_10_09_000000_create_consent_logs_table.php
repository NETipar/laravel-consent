<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use NETipar\Consent\Config\ConsentConfig;

/*
 * The provider loads this file via loadMigrationsFrom() and `consent-migrations` publishes
 * it under the SAME filename, so the migrator (which dedups by name) runs it only once
 * even when both copies exist. Table and connection come from the `consent.log` config.
 */
return new class extends Migration
{
    /**
     * The migrator opens its transaction, honours --pretend and sets the default connection on this one.
     */
    public function getConnection(): ?string
    {
        return app(ConsentConfig::class)->logConnection;
    }

    public function up(): void
    {
        Schema::create(app(ConsentConfig::class)->logTable, function (Blueprint $table): void {
            $table->id();
            $table->uuid('event_id')->unique();
            $table->uuid('consent_id');
            $table->string('action', 16);
            $table->json('granted');
            $table->string('version', 64);
            $table->string('url', 2048)->nullable();
            $table->string('ip_hash', 64)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->string('user_id', 64)->nullable()->index();
            $table->dateTime('created_at')->index();

            $table->index(['consent_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists(app(ConsentConfig::class)->logTable);
    }
};
