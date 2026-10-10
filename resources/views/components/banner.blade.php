@props([
    'title' => null,
    'description' => null,
    'policyUrl' => app(\NETipar\Consent\ConsentManager::class)->policyUrl(),
    'policyLabel' => null,
])
@php
    $manager = app(\NETipar\Consent\ConsentManager::class);
    $categories = $manager->categories();
    $decided = $manager->hasDecision();
    $title ??= __('consent::consent.banner.title');
    $description ??= __('consent::consent.banner.description');
    $policyLabel ??= __('consent::consent.banner.policy');
@endphp
<div x-data="consentBanner" data-consent-root>
    <section {{ $attributes }} role="dialog" aria-modal="false" aria-labelledby="consent-title" aria-describedby="consent-description" tabindex="-1" x-ref="prompt" x-bind:hidden="!open" @if($decided) hidden @endif>
        @if ($slot->isNotEmpty())
            {{ $slot }}
        @else
            <h2 id="consent-title">{{ $title }}</h2>
            <p id="consent-description">{{ $description }} @if($policyUrl)<a href="{{ $policyUrl }}">{{ $policyLabel }}</a>@endif</p>
            <div data-consent-actions>
                <button type="button" x-on:click="acceptAll()">{{ __('consent::consent.banner.accept_all') }}</button>
                <button type="button" x-on:click="rejectAll()">{{ __('consent::consent.banner.reject_all') }}</button>
                <button type="button" x-on:click="openSettings($el)">{{ __('consent::consent.banner.settings') }}</button>
            </div>
        @endif
    </section>
    <dialog {{ isset($settings) ? $settings->attributes : '' }} x-ref="settings" aria-labelledby="consent-settings-title" x-on:close="closeSettings()">
        @if (isset($settings) && $settings->isNotEmpty())
            {{ $settings }}
        @else
            <h2 id="consent-settings-title">{{ __('consent::consent.banner.settings_title') }}</h2>
            <p>{{ __('consent::consent.banner.settings_intro') }}</p>
            <ul>
                @foreach ($categories as $category)
                    <li>
                        <input type="checkbox" id="consent-category-{{ $category->key }}" x-model="selection['{{ $category->key }}']" @if($category->required) checked disabled @endif>
                        <label for="consent-category-{{ $category->key }}">{{ $category->label() }}</label>
                        <p>{{ $category->description() }}</p>
                    </li>
                @endforeach
            </ul>
            <div data-consent-actions>
                <button type="button" x-on:click="save()">{{ __('consent::consent.banner.save') }}</button>
                <button type="button" x-on:click="closeSettings()">{{ __('consent::consent.banner.cancel') }}</button>
            </div>
        @endif
    </dialog>
</div>
