<?php

declare(strict_types=1);

namespace NETipar\Consent\Exceptions;

final class UnknownCategoryException extends ConsentException
{
    /**
     * @param  list<string>  $known
     */
    public static function named(string $key, array $known): self
    {
        return new self(sprintf('Unknown consent category "%s". Known: %s', $key, implode(', ', $known)));
    }
}
