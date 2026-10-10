# Examples

Copy-and-adapt recipes. The package ships no CSS, so every snippet owns its
styling. Reference: [integration guide](../docs/en/integration.md) and
[configuration](../docs/en/configuration.md).

- [A Tailwind-styled Blade banner](#a-tailwind-styled-blade-banner)
- [A shadcn-vue dialog banner](#a-shadcn-vue-dialog-banner)
- [Gating a YouTube embed](#gating-a-youtube-embed)
- [Migrating from netipar/cookie-consent 1.x](#migrating-from-netiparcookie-consent-1x)

## A Tailwind-styled Blade banner

A reusable `resources/views/components/cookie-banner.blade.php` that wraps the
package component. The attributes land on the first-layer `<section>`, the
`settings` slot attributes on the `<dialog>`. The ids `consent-title`,
`consent-description` and `consent-settings-title` are required by the
`aria-*` attributes of the wrappers.

```blade
@php($categories = app(\NETipar\Consent\ConsentManager::class)->categories())

<x-consent::banner class="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-white/10 bg-slate-900/95 p-5 text-white shadow-2xl backdrop-blur sm:inset-x-auto sm:right-4 sm:w-[26rem]">
    <h2 id="consent-title" class="text-lg font-semibold">{{ __('consent::consent.banner.title') }}</h2>
    <p id="consent-description" class="mt-2 text-sm text-slate-300">
        {{ __('consent::consent.banner.description') }}
        @if ($url = app(\NETipar\Consent\ConsentManager::class)->policyUrl())
            <a href="{{ $url }}" class="underline underline-offset-4">{{ __('consent::consent.banner.policy') }}</a>
        @endif
    </p>

    <div class="mt-4 grid grid-cols-2 gap-2">
        {{-- Accept and reject share one look: rejecting must be as easy as accepting. --}}
        <button type="button" x-on:click="acceptAll()" class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400">
            {{ __('consent::consent.banner.accept_all') }}
        </button>
        <button type="button" x-on:click="rejectAll()" class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400">
            {{ __('consent::consent.banner.reject_all') }}
        </button>
        <button type="button" x-on:click="openSettings($el)" class="col-span-2 rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/10">
            {{ __('consent::consent.banner.settings') }}
        </button>
    </div>

    <x-slot:settings class="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-2xl bg-white p-6 text-slate-800 shadow-2xl backdrop:bg-black/60">
        <h2 id="consent-settings-title" class="text-xl font-semibold">{{ __('consent::consent.banner.settings_title') }}</h2>
        <p class="mt-2 text-sm text-slate-500">{{ __('consent::consent.banner.settings_intro') }}</p>

        <ul class="mt-4 space-y-3">
            @foreach ($categories as $category)
                <li class="flex items-start gap-3">
                    <input
                        type="checkbox"
                        id="consent-category-{{ $category->key }}"
                        x-model="selection['{{ $category->key }}']"
                        @disabled($category->required)
                        class="mt-1 size-4"
                    >
                    <label for="consent-category-{{ $category->key }}">
                        <span class="font-medium">{{ $category->label() }}</span>
                        <span class="block text-sm text-slate-500">{{ $category->description() }}</span>
                    </label>
                </li>
            @endforeach
        </ul>

        <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" x-on:click="closeSettings()" class="rounded-lg border px-4 py-2 text-sm">{{ __('consent::consent.banner.cancel') }}</button>
            <button type="button" x-on:click="save()" class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950">{{ __('consent::consent.banner.save') }}</button>
        </div>
    </x-slot:settings>
</x-consent::banner>
```

Use `<x-cookie-banner />` in the layout instead of `<x-consent::banner />`. The
required category's checkbox is disabled; Alpine keeps its `selection` entry
`true`.

## A shadcn-vue dialog banner

The complete component, using the slot props of `<ConsentBanner>` (refs, so
`.value` in the template), is in the
[integration guide](../docs/en/integration.md#consentbanner). Mount it once
in the layout and reopen the settings from anywhere with `useConsent()`:

```vue
<script setup lang="ts">
import { useConsent } from '@netipar/consent-vue3';

const { openSettings, texts } = useConsent();
</script>

<template>
    <button type="button" @click="openSettings">{{ texts.settingsTitle }}</button>
</template>
```

## Gating a YouTube embed

Server-side, render the player only when the visitor allowed `marketing`, and
offer a way to change the decision otherwise:

```blade
@consent('marketing')
    <iframe
        src="https://www.youtube-nocookie.com/embed/{{ $videoId }}"
        title="{{ $title }}"
        loading="lazy"
        allowfullscreen
        class="aspect-video w-full"
    ></iframe>
@else
    <div class="grid aspect-video w-full place-items-center rounded-lg bg-slate-100 p-6 text-center">
        <p>This video needs marketing cookies.</p>
        <button type="button" data-consent-focus-return x-data x-on:click="$store.consent.openSettings($el)" class="underline">
            Cookie settings
        </button>
    </div>
@endconsent
```

`@consent` is evaluated when the page renders, so a visitor who accepts on
this very page sees the player on the next request. To react immediately, let
Alpine decide in the browser; `granted` is the reactive part of the store:

```blade
<div x-data>
    <template x-if="$store.consent.granted.includes('marketing')">
        <iframe src="https://www.youtube-nocookie.com/embed/{{ $videoId }}" title="{{ $title }}" class="aspect-video w-full"></iframe>
    </template>
    <div x-show="! $store.consent.granted.includes('marketing')">
        <p>This video needs marketing cookies.</p>
        <button type="button" data-consent-focus-return x-on:click="$store.consent.openSettings($el)">Cookie settings</button>
    </div>
</div>
```

For third-party scripts (as opposed to markup), change the type instead and
the package activates them for you: `<script type="text/plain"
data-consent="marketing" src="…"></script>`.

## Migrating from netipar/cookie-consent 1.x

Short version: remove the old package, install this one, move your categories
into `config/consent.php`, place `<x-consent::banner />`, replace
`check_cookie_consent('analytics')` with `Consent::allows('analytics')`.
Everything else — including the one-time re-prompt of existing visitors and
the opt-out to opt-in flip of the helper — is in
[UPGRADE.md](../UPGRADE.md#from-netiparcookie-consent-1x).
