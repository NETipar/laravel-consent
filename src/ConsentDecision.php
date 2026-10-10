<?php

declare(strict_types=1);

namespace NETipar\Consent;

use NETipar\Consent\Config\ConsentConfig;

final readonly class ConsentDecision
{
    /**
     * @param  list<string>  $granted
     */
    public function __construct(
        public array $granted,
        public ?string $version,
    ) {}

    public static function none(): self
    {
        return new self([], null);
    }

    public function isValidFor(ConsentConfig $config): bool
    {
        return $this->version !== null && $this->version === $config->version;
    }
}
