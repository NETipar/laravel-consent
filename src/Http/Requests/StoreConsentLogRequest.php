<?php

declare(strict_types=1);

namespace NETipar\Consent\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use NETipar\Consent\Config\ConsentConfig;

final class StoreConsentLogRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(ConsentConfig $config): array
    {
        return [
            'event_id' => ['required', 'uuid'],
            'consent_id' => ['required', 'uuid'],
            'action' => ['required', Rule::in(['accept_all', 'reject_all', 'save', 'withdraw'])],
            'granted' => ['present', 'array', 'max:50'],
            'granted.*' => ['string', Rule::in($config->keys())],
            'version' => ['required', 'string', 'max:64'],
            'url' => ['nullable', 'string', 'max:2048'],
        ];
    }
}
