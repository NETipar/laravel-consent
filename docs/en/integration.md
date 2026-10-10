# Integration guide

> 🇭🇺 Magyar változat: [docs/hu/integration.md](../hu/integration.md)

The package ships behaviour and a11y wiring, never styling. Whatever you see on
screen is markup you own (Tailwind, shadcn-vue, plain CSS). Pick the stack that
matches your app:

- [Blade and Livewire (Alpine)](#blade-and-livewire-alpine)
- [Inertia and Vue 3](#inertia-and-vue-3)
- [Plain JavaScript](#plain-javascript)

The sections after those apply to every stack.

## Blade and Livewire (Alpine)

### Install and wire up

```bash
composer require netipar/laravel-consent
php artisan vendor:publish --tag=consent-config
npm install @netipar/consent-core @netipar/consent-alpine
```

Layout:

```blade
<head>
    …
    @consentConfig
</head>
<body>
    …
    <x-consent::banner />
</body>
```

`@consentConfig` prints `<script type="application/json" id="consent-config">`
with `Consent::clientConfig()`. The type is not executable, so it needs no CSP
nonce.

`resources/js/app.js` — register the adapter **before** Alpine starts.

With Livewire bundling Alpine (Livewire 3 and later):

```js
import { Alpine, Livewire } from '../../vendor/livewire/livewire/dist/livewire.esm';
import { registerConsent } from '@netipar/consent-alpine';
import { readConsentConfig } from '@netipar/consent-core';

registerConsent(Alpine, readConsentConfig());
Livewire.start();
```

With plain Alpine:

```js
import Alpine from 'alpinejs';
import { registerConsent } from '@netipar/consent-alpine';
import { readConsentConfig } from '@netipar/consent-core';

registerConsent(Alpine, readConsentConfig());
Alpine.start();
```

`registerConsent(Alpine, config, options?)` creates the manager, registers
`Alpine.store('consent')` and `Alpine.data('consentBanner')`, and returns the
manager. `options` is the core [`CreateConsentOptions`](#plain-javascript).

A footer control that reopens the settings:

```blade
<button type="button" data-consent-focus-return x-data x-on:click="$store.consent.openSettings($el)">Cookie settings</button>
```

### The banner component

`<x-consent::banner>` renders an unstyled first layer and a native
`<dialog>` for the settings, wrapped in `<div x-data="consentBanner" data-consent-root>`.
The server adds `hidden` to the first layer when a valid decision exists, so
there is no flash; Alpine keeps it in sync afterwards.

| Attribute | Default | Notes |
|---|---|---|
| `title` | `consent::consent.banner.title` | Heading of the default prompt. |
| `description` | `consent::consent.banner.description` | Paragraph of the default prompt. |
| `policy-url` | `Consent::policyUrl()` | Link target; no link when `null`. Bind with `:policy-url="…"`. |
| `policy-label` | `consent::consent.banner.policy` | Link text. |
| any other (`class`, `id`, `data-*`) | — | Forwarded to the first-layer `<section>`. |

Button labels and the settings texts always come from the lang files, so a
locale switch changes them with no extra work.

#### Slots

The default markup is a starting point. Both layers can be replaced:

- **Default slot** replaces the content of the first layer (the `<section>`).
  Keep `id="consent-title"` and `id="consent-description"` on the heading and
  the paragraph: the section's `aria-labelledby` / `aria-describedby` point at
  them.
- **`settings` slot** (`<x-slot:settings>`) replaces the content of the
  `<dialog>`. Its attributes (`class`, …) are applied to the `<dialog>`. Keep
  `id="consent-settings-title"` on the heading: the dialog's `aria-labelledby`
  points at it.

Inside both slots the `consentBanner` Alpine scope is available (see
[the Alpine API](#alpine-api)), so buttons call `acceptAll()`, `rejectAll()`,
`openSettings()`, `closeSettings()` and `save()` directly. To loop over the
categories use the manager:

```blade
@php($categories = app(\NETipar\Consent\ConsentManager::class)->categories())

<x-consent::banner class="fixed inset-x-3 bottom-3 rounded-xl bg-white p-5 shadow-xl sm:max-w-md">
    <h2 id="consent-title" class="text-lg font-semibold">We use cookies</h2>
    <p id="consent-description" class="mt-2 text-sm text-gray-600">Analytics and marketing cookies only with your consent.</p>
    <div class="mt-4 flex gap-2">
        <button type="button" x-on:click="acceptAll()" class="rounded bg-black px-4 py-2 text-white">Accept all</button>
        <button type="button" x-on:click="rejectAll()" class="rounded bg-black px-4 py-2 text-white">Reject all</button>
        <button type="button" x-on:click="openSettings($el)" class="rounded border px-4 py-2">Settings</button>
    </div>

    <x-slot:settings class="m-auto w-full max-w-lg rounded-xl p-6 backdrop:bg-black/60">
        <h2 id="consent-settings-title" class="text-lg font-semibold">Cookie settings</h2>
        <ul class="mt-4 space-y-3">
            @foreach ($categories as $category)
                <li>
                    <label class="flex items-start gap-2">
                        <input type="checkbox" x-model="selection['{{ $category->key }}']" @disabled($category->required)>
                        <span>
                            <span class="font-medium">{{ $category->label() }}</span>
                            <span class="block text-sm text-gray-600">{{ $category->description() }}</span>
                        </span>
                    </label>
                </li>
            @endforeach
        </ul>
        <div class="mt-6 flex justify-end gap-2">
            <button type="button" x-on:click="closeSettings()" class="rounded border px-4 py-2">Cancel</button>
            <button type="button" x-on:click="save()" class="rounded bg-black px-4 py-2 text-white">Save selection</button>
        </div>
    </x-slot:settings>
</x-consent::banner>
```

Keep "Reject all" visually as prominent as "Accept all" — see
[Accessibility](#accessibility).

### Alpine API

`Alpine.store('consent')` — a reactive mirror of the manager:

| Member | Type | Notes |
|---|---|---|
| `granted` | `string[]` | Granted category keys (required ones always included). |
| `decided` | `boolean` | A valid decision exists. |
| `promptOpen` | `boolean` | The first layer is shown. |
| `settingsOpen` | `boolean` | The settings dialog is open. |
| `texts` | `ConsentTexts` | Server-resolved strings (`title`, `acceptAll`, …) for hand-written markup. |
| `categories` | `ConsentCategory[]` | `key`, `required`, `label`, `description`, `cookies`. |
| `has(key)` | `boolean` | Required → `true`; unknown key throws `ConsentError`. |
| `acceptAll()`, `rejectAll()`, `save(keys)`, `withdraw()` | | Write the decision. `withdraw()` deletes both cookies and shows the prompt again. |
| `openSettings()`, `closeSettings()` | | `closeSettings()` never saves. |
| `dismissPrompt()` | | Hides the prompt for this page view only; no cookie is written. |

`x-data="consentBanner"` (what the Blade component uses; reuse it in hand-written markup):

| Member | Notes |
|---|---|
| `selection` | `Record<string, boolean>` bound to the checkboxes with `x-model`. Required categories are `true`; optional ones start from the stored decision (`false` when undecided). |
| `open`, `settingsOpen` | Reactive getters for the prompt and the dialog. |
| `isRequired(key)`, `toggle(key)` | `toggle` ignores required categories. |
| `acceptAll()`, `rejectAll()` | |
| `save()` | Saves the keys whose `selection` entry is `true`. |
| `openSettings(opener?)`, `closeSettings()` | Opening remembers the opener; closing restores focus to it (see [Focus return](#focus-return)). Pass the opener explicitly: `x-on:click="openSettings($el)"`. |

The component owns the dialog: it calls `showModal()` / `close()` on
`x-ref="settings"`, resets `selection` when the dialog closes (Escape and
Cancel never save) and focuses `x-ref="prompt"` the first time the prompt
appears — never again on Livewire navigations.

Gate your own Alpine markup on the store. Read `granted` in bindings: it is
the reactive part of the store, `has()` is a plain method call and does not
re-evaluate by itself.

```blade
<div x-data x-show="$store.consent.granted.includes('marketing')">…</div>
```

## Inertia and Vue 3

### Install and register the plugin

```bash
composer require netipar/laravel-consent
php artisan vendor:publish --tag=consent-config
npm install @netipar/consent-core @netipar/consent-vue3
```

Share the client config (it is resolved per request, so the locale is right):

```php
// app/Http/Middleware/HandleInertiaRequests.php
use NETipar\Consent\Facades\Consent;

public function share(Request $request): array
{
    return [
        ...parent::share($request),
        'consent' => fn () => Consent::clientConfig(),
    ];
}
```

Install the plugin in the **client** entry:

```ts
import { createApp, h } from 'vue';
import { createInertiaApp } from '@inertiajs/vue3';
import { createConsentPlugin, type ConsentConfig } from '@netipar/consent-vue3';

createInertiaApp({
    setup({ el, App, props, plugin }) {
        createApp({ render: () => h(App, props) })
            .use(plugin)
            .use(createConsentPlugin(props.initialPage.props.consent as ConsentConfig))
            .mount(el);
    },
});
```

SSR-safe: on the server (no `document`, e.g. Inertia SSR) the plugin provides an
inert manager — undecided, prompt open, every action a no-op — so
`<ConsentBanner>` and `useConsent()` render without throwing and the server
markup contains the prompt. The consent UI is effectively client-side: the
browser creates the real manager and the banner hides the prompt on mount for
visitors who already decided. The plugin destroys the manager when the app
unmounts.

For a visitor who already decided, the server-rendered HTML still contains the
open prompt: `<ConsentBanner>` re-applies `hidden` on mount, and Vue may log a
dev-only hydration attribute-mismatch warning in that case. If you render your
own markup in the slot, bind `hidden` yourself after mount (or wrap the banner
in a client-only boundary).

### ConsentBanner

`<ConsentBanner>` is renderless. Without a slot it renders the same unstyled
structure as the Blade view (strings come from the server-resolved `texts` and
category `label` / `description`). With a default scoped slot it hands you
everything:

| Slot prop | Type |
|---|---|
| `texts`, `categories`, `manager` | plain values (`ConsentTexts`, `ConsentCategory[]`, `ConsentManager`) |
| `granted`, `decided`, `promptOpen`, `settingsOpen` | **refs** |
| `selection` | reactive `Record<string, boolean>` |
| `has(key)`, `acceptAll()`, `rejectAll()`, `save(keys)`, `withdraw()`, `dismissPrompt()` | functions |
| `openSettings(opener?)`, `closeSettings()` | functions (remember and restore focus, reset `selection`). Pass the opener explicitly: `@click="openSettings($event.currentTarget)"` (a bare `@click="openSettings"` also works: the event's `currentTarget` is used). |
| `toggle(key)`, `saveSelection()` | functions (`toggle` ignores required categories) |
| `promptRef`, `dialogRef` | template refs, bind them with `:ref` |

> Slot props are **not** auto-unwrapped by Vue templates. Read the refs with
> `.value`: `v-if="promptOpen.value"`, `:open="settingsOpen.value"`.

Bind `promptRef` (with `tabindex="-1"`) so the prompt receives focus the first
time it appears. Bind `dialogRef` only when you use a native `<dialog>`; a
component-library dialog opens from `settingsOpen.value` instead.

A shadcn-vue dialog for the settings layer (the dialog supplies the focus trap,
Escape and backdrop):

```vue
<script setup lang="ts">
import { ConsentBanner } from '@netipar/consent-vue3';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
</script>

<template>
    <ConsentBanner
        v-slot="{ texts, categories, promptOpen, settingsOpen, selection, acceptAll, rejectAll, openSettings, closeSettings, toggle, saveSelection, promptRef }"
    >
        <section
            v-if="promptOpen.value"
            :ref="promptRef"
            role="dialog"
            aria-modal="false"
            aria-labelledby="consent-title"
            aria-describedby="consent-description"
            tabindex="-1"
            class="fixed inset-x-3 bottom-3 rounded-xl border bg-background p-5 shadow-xl sm:max-w-md"
        >
            <h2 id="consent-title" class="text-lg font-semibold">{{ texts.title }}</h2>
            <p id="consent-description" class="mt-2 text-sm text-muted-foreground">{{ texts.description }}</p>
            <div class="mt-4 flex gap-2">
                <Button @click="acceptAll">{{ texts.acceptAll }}</Button>
                <Button @click="rejectAll">{{ texts.rejectAll }}</Button>
                <Button variant="outline" @click="openSettings">{{ texts.settings }}</Button>
            </div>
        </section>

        <Dialog :open="settingsOpen.value" @update:open="(open: boolean) => !open && closeSettings()">
            <DialogContent>
                <DialogHeader>
                    <DialogTitle id="consent-settings-title">{{ texts.settingsTitle }}</DialogTitle>
                    <DialogDescription>{{ texts.settingsIntro }}</DialogDescription>
                </DialogHeader>
                <ul class="space-y-3">
                    <li v-for="category in categories" :key="category.key" class="flex items-start gap-3">
                        <Checkbox
                            :id="`consent-category-${category.key}`"
                            :model-value="selection[category.key]"
                            :disabled="category.required"
                            @update:model-value="toggle(category.key)"
                        />
                        <label :for="`consent-category-${category.key}`">
                            <span class="font-medium">{{ category.label }}</span>
                            <span class="block text-sm text-muted-foreground">{{ category.description }}</span>
                        </label>
                    </li>
                </ul>
                <DialogFooter>
                    <Button variant="outline" @click="closeSettings">{{ texts.cancel }}</Button>
                    <Button @click="saveSelection">{{ texts.save }}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </ConsentBanner>
</template>
```

Mount it once in your layout. To reopen the settings from anywhere, use the
composable (below), for example in the footer:

```vue
<script setup lang="ts">
import { useConsent } from '@netipar/consent-vue3';

const { openSettings } = useConsent();
</script>

<template>
    <button type="button" @click="openSettings">Cookie settings</button>
</template>
```

### useConsent()

`useConsent()` injects the manager provided by the plugin (it throws a
`ConsentError` if the plugin is not installed) and returns:

| Member | Notes |
|---|---|
| `manager` | The `ConsentManager` (see [Plain JavaScript](#plain-javascript)). |
| `texts`, `categories` | Server-resolved strings and categories. |
| `granted`, `decided`, `promptOpen`, `settingsOpen` | Refs (`shallowRef`), updated on every change; subscriptions end with the calling effect scope. |
| `has(key)` | Required → `true`; unknown key throws. |
| `acceptAll()`, `rejectAll()`, `save(keys)`, `withdraw()` | |
| `openSettings()`, `closeSettings()`, `dismissPrompt()` | |

```ts
const { has, granted } = useConsent();

if (has('marketing')) {
    // …
}
```

## Plain JavaScript

`@netipar/consent-core` is framework-free:

```ts
import { createConsent, readConsentConfig, CHANGE_EVENT, LOG_FAILED_EVENT } from '@netipar/consent-core';

const consent = createConsent(readConsentConfig());

consent.onChange((state, previous, action) => {
    console.debug(action, state.granted);
});

document.addEventListener(CHANGE_EVENT, (event) => {
    const { state, previous, action } = (event as CustomEvent).detail;
});

document.addEventListener(LOG_FAILED_EVENT, (event) => {
    console.warn('consent log failed', (event as CustomEvent).detail);
});
```

`createConsent(config, options?)` returns a `ConsentManager`:

| Member | Notes |
|---|---|
| `config` | The `ConsentConfig`. |
| `state()` | `{ decided, granted, version }`. |
| `ui()` | `{ promptOpen, settingsOpen }`. |
| `has(key)`, `hasDecision()` | `has` throws on an unknown key. |
| `acceptAll()`, `rejectAll()`, `save(keys)`, `withdraw()` | `save` grants the required categories plus the known optional keys given. |
| `openSettings()`, `closeSettings()`, `dismissPrompt()` | |
| `onChange(listener)`, `onUi(listener)` | Return an unsubscribe function. `onChange` receives `(state, previous, action)`, `action` being `accept_all`, `reject_all`, `save`, `withdraw` or `sync`. |
| `sync(root?)` | Re-reads the cookies (another tab may have decided), re-evaluates the prompt and activates gated scripts under `root`. Called automatically on `livewire:navigated` and — so a withdrawal in another tab purges this tab's cookies too — when the tab becomes visible (`visibilitychange`) and on a bfcache restore (`pageshow` with `persisted`). |
| `markLoaded(category)` | Tells the manager that something that cannot be unloaded ran for a category (used by gated scripts and Google; see [reload on revoke](../../README.md#complete-withdrawal)). |
| `destroy()` | Removes listeners. |

`onChange` and the `consent:change` event fire only when the granted set or
the `decided` flag actually changes; pressing "Accept all" twice is one event.
`sync` is reported with action `sync` and is never logged.

`CreateConsentOptions` (all optional): `document`, `window`, `reload`
(default `() => window.location.reload()`), `fetch` and `uuid` (log transport),
and the switches `log`, `gatedScripts`, `google`, `syncOnLivewireNavigate`, `syncOnVisibility`
(each defaults to `true`).

On every transition the order is: write the cookies, purge the cookies of
removed categories, notify listeners (Google first, then the log, then yours)
and dispatch `consent:change`, activate gated scripts, and finally — on
`setTimeout(0)` — reload if needed.

Besides `createConsent` and `readConsentConfig(doc?, id?)` the core exports
`activateGatedScripts`, `attachGoogle`, `attachLog`, `purgeCategoryCookies`,
`readState`, `ConsentError`, `CHANGE_EVENT`, `LOG_FAILED_EVENT` and the types
`ConsentAction`, `ConsentCategory`, `ConsentConfig`, `ConsentManager`,
`ConsentState`, `ConsentTexts`, `ConsentUi`, `CookieTableCategory`,
`CookieTableEntry`, `CreateConsentOptions`, `GoogleSignal`, `GoogleTag`. The
adapters re-export `readConsentConfig` (Alpine) and the main types.

## Gated scripts

Hold back any third-party script until its category is granted by changing its
type to `text/plain`:

```html
<script type="text/plain" data-consent="marketing" nonce="{{ $nonce }}">
    // runs only after "marketing" is granted
</script>

<script type="text/plain" data-consent="analytics" src="https://example.com/widget.js" async></script>

<script type="text/plain" data-consent="analytics marketing" data-consent-type="module">
    import '/js/tracking.js';
</script>
```

- `data-consent` lists category keys separated by spaces or commas; **all** of
  them must be granted. An unknown key or an empty value never activates the
  script.
- On activation the package creates a new `<script>`, copies every attribute
  except `type` and `data-consent*` (including `src`, `async`, `defer` and the
  CSP `nonce`), sets `type` to `data-consent-type` (default `text/javascript`),
  copies the inline code and inserts it right after the original, which is
  marked `data-consent-activated="true"`. A script never runs twice.
- Dynamically inserted scripts are async by default, so the package sets
  `async` to what the original tag had: `src` scripts keep their document
  order unless the original tag has `async`.
- Scripts are scanned on load, after every decision, on `livewire:navigated`
  and on `manager.sync(root)` — call that (or `activateGatedScripts(manager, root)`)
  after inserting markup yourself.

Server-side, `@consent` gates Blade output:

```blade
@consent('marketing')
    <iframe src="https://www.youtube.com/embed/…" loading="lazy"></iframe>
@else
    <p>Allow marketing cookies to watch this video.</p>
@endconsent
```

Also available: `@unlessconsent('marketing') … @endconsent` and
`@elseconsent('analytics')` (with an argument). Never write a bare
`@elseconsent`: it fails at run time because the directive needs the category
argument. Use `@else`, and keep whitespace before `@else` and `@endconsent`.
The server sees the decision only when the page is rendered, so a visitor who
decides on the page does not see the `@consent` content until the next
request; use a gated script for content that must react immediately.

## Google Consent Mode v2

Describe your tags and, if needed, the signals in `config/consent.php`:

```php
'google' => [
    'tags' => [
        ['id' => 'G-XXXXXXX', 'category' => 'analytics'],
        ['id' => 'AW-XXXXXXXXX', 'category' => 'marketing'],
    ],
    'signals' => [
        'analytics_storage' => 'analytics',
        'ad_storage' => 'marketing',
        'ad_user_data' => 'marketing',
        'ad_personalization' => 'marketing',
    ],
    'ads_data_redaction' => false,
    'url_passthrough' => false,
],
```

This is **Basic** mode: nothing from Google loads before consent.

1. While no tag's category is granted, no request is made and no script is added.
2. When a tag's category is first granted — on the decision, or on a page
   load that already carries a valid decision — the core defines `gtag`,
   sends `consent default` with the four signals set `granted` or `denied`
   from their categories, optionally `set ads_data_redaction` and
   `url_passthrough`, injects `gtag/js?id=<first granted tag>` (deferred with
   `requestIdleCallback`, falling back to `setTimeout`), runs `js` and then
   `config` for every granted tag.
3. A later grant sends `consent update` and `config` for the tags that just
   became granted.
4. A revoke sends `consent update` with the lost signals `denied`. Loaded tags
   cannot be unloaded, so the cookies of the category are purged and — with
   `reload_on_revoke` — the page reloads once.

**Housekeeping on every page load.** Once a visitor has decided, the JS core removes the configured cookies (`categories.*.cookies`, exact names and `prefix*` patterns, on the host and every parent domain) of every optional category that is not granted — on the initial page load and on every re-sync (Livewire navigation, tab becoming visible, bfcache restore), not only at the moment of a revocation. So a tag that loaded before the decision, or a second tab that kept writing `_ga*`, cannot leave residue behind. Visitors who have not decided yet are never touched (nothing is purged before a decision), required categories are never purged, and this cleanup never triggers a page reload, because nothing was loaded for a category that is not granted.

Do not add your own `gtag.js` snippet to the layout; it would load before
consent. Allow the hosts Google documents for your products in your CSP
(see [Google's overview](https://business.safety.google/adscookies/)).

To guard a conversion call, use the store (Alpine) or `has()`:

```js
if (Alpine.store('consent').has('marketing') && typeof window.gtag === 'function') {
    window.gtag('event', 'conversion', { send_to: 'AW-XXXXXXXXX/abc' });
}
```

## Cookie table

Render the cookies you declared in config on the policy page, so the page
cannot drift from reality. Only rich `cookies` entries are listed (see the
[configuration reference](configuration.md#cookie-entries)).

```blade
<x-consent::cookie-table />
```

| Prop | Default | Notes |
|---|---|---|
| `categories` | `Consent::cookieTable()` | Override with your own data of the same shape. |
| `:only` | `null` | A **bound** list of category keys: `:only="['analytics', 'marketing']"`. A single string (`only="analytics"`) also works. |
| `headings` | `__('consent::consent.cookies.headings')` | Array with `name`, `provider`, `purpose`, `lifetime`. |
| `:show-empty` | `true` | `false` hides categories that list no cookies. |

Sections follow the config order, including categories without cookies (an
empty `<p data-consent-empty>` marks them). The root is always
`<div data-consent-cookie-table>`; the fallback markup has no classes, but
carries `data-consent-category` and `data-consent-required` on every
`<section>`, so you can style it from CSS — or replace everything inside the
root with a slot:

```blade
<x-consent::cookie-table class="space-y-8" :only="['analytics', 'marketing']">
    @foreach (Consent::cookieTable() as $section)
        @continue($section['cookies'] === [])
        <section>
            <h3 class="text-lg font-semibold">{{ $section['label'] }}</h3>
            <p>{{ $section['description'] }}</p>
            <ul>
                @foreach ($section['cookies'] as $cookie)
                    <li>{{ $cookie['name'] }} — {{ $cookie['provider'] }}, {{ $cookie['lifetime'] }}: {{ $cookie['purpose'] }}</li>
                @endforeach
            </ul>
        </section>
    @endforeach
</x-consent::cookie-table>
```

Each section is `['key', 'label', 'description', 'required', 'cookies' => [['name', 'provider', 'purpose', 'lifetime', 'domain'], …]]`
with `provider`, `purpose`, `lifetime` and `domain` possibly `null`.
Everything is already translated for the current locale.

Vue: pass the table and the headings as Inertia props.

```php
return Inertia::render('Legal/Cookies', [
    'cookieTable' => Consent::cookieTable(),
    'cookieHeadings' => __('consent::consent.cookies.headings'),
]);
```

```vue
<script setup lang="ts">
import { ConsentCookieTable, type CookieTableCategory, type CookieTableHeadings } from '@netipar/consent-vue3';

defineProps<{ cookieTable: CookieTableCategory[]; cookieHeadings: CookieTableHeadings }>();
</script>

<template>
    <ConsentCookieTable :categories="cookieTable" :headings="cookieHeadings" :only="['analytics']" />
</template>
```

Props: `categories` and `headings` (required), `only` (`string[]`, default all),
`showEmpty` (default `true`). The default scoped slot receives the filtered
`categories` and the `headings`; the root `div[data-consent-cookie-table]` is
kept and attributes such as `class` fall through to it.

## Accessibility

The default markup (Blade and Vue) follows one contract; keep it when you
replace the markup:

- The first layer is `<section role="dialog" aria-modal="false" aria-labelledby="consent-title" aria-describedby="consent-description" tabindex="-1">`. It is non-modal with no focus trap — the site stays usable — and receives focus once, when it first appears.
- The settings layer is a native `<dialog aria-labelledby="consent-settings-title">` opened with `showModal()`: the browser provides the focus trap, Escape and the backdrop. Escape and Cancel close **without saving**, and focus returns to the control that opened it (see [Focus return](#focus-return)).
- Every control is a `<button type="button">`. The required category's checkbox is `checked disabled`; optional ones are unchecked until the visitor decides.
- "Accept all" and "Reject all" are the same element kind, size and variant. Rejecting must never be a text link or visually weaker.
- Offer a permanent reopen control (a footer button calling `$store.consent.openSettings($el)` or `useConsent().openSettings()`; mark it `data-consent-focus-return`): withdrawing consent must be as easy as giving it.

### Focus return

When the settings dialog closes, focus goes back to the control that opened
it. Two things matter:

- **Pass the opener explicitly.** Safari (and Firefox on macOS) do not focus a
  clicked `<button>`, so `document.activeElement` is `<body>` there and the
  fallback finds nothing. Use `x-on:click="openSettings($el)"` (Alpine; the
  default Blade view does), `$store.consent.openSettings($el)` for a reopen
  control outside the component, or `@click="openSettings($event.currentTarget)"`
  (Vue). Without an argument the focused element is used.
- **`[data-consent-focus-return]`.** If the opener is gone — typically the
  Settings button inside the prompt, which "Save" has just hidden — focus moves
  to the first element carrying this attribute, e.g. the footer's reopen
  button; without such an element focus is left alone.

```html
<button type="button" data-consent-focus-return x-data x-on:click="$store.consent.openSettings($el)">Cookie settings</button>
```
