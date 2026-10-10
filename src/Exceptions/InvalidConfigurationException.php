<?php

declare(strict_types=1);

namespace NETipar\Consent\Exceptions;

final class InvalidConfigurationException extends ConsentException
{
    public static function forKey(string $key, string $reason): self
    {
        return new self("consent.{$key} {$reason}");
    }
}
