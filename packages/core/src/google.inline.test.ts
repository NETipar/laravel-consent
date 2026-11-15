import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The exact file `@consentConfig` prints in Advanced mode.
import bootstrapSource from '../../../resources/js/google-advanced.js?raw';
import { makeConfig, makeEnv, seedCookies, tick } from './__tests__/support';
import type { TestEnv } from './__tests__/support';
import { createConsent } from './consent';
import { GOOGLE_BOOT_MARKER } from './google';
import type { ConsentConfig, ConsentManager } from './types';

type GoogleConfig = NonNullable<ConsentConfig['google']>;
type Bootstrap = (config: unknown, win: Window) => void;

const SIGNALS = {
    analytics_storage: 'analytics',
    ad_storage: 'marketing',
    ad_user_data: 'marketing',
    ad_personalization: 'marketing',
};

const ALL_DENIED = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
const ALL_GRANTED = { analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' };
const ANALYTICS_ONLY = { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };

const GTM_START = { 'gtm.start': expect.any(Number), event: 'gtm.js' };
const RESET = { consent_granted: null };
const CONTAINER_SRC = 'https://www.googletagmanager.com/gtm.js?id=GTM-TEST';

function makeGoogle(overrides: Partial<GoogleConfig> = {}): GoogleConfig {
    return {
        mode: 'advanced',
        tags: [],
        containers: [{ id: 'GTM-TEST', categories: ['analytics', 'marketing'] }],
        signals: { ...SIGNALS },
        adsDataRedaction: false,
        urlPassthrough: false,
        updateEvent: 'consent_update',
        ...overrides,
    };
}

/** The subset ConsentManager::configScripts() embeds — the script must not read anything else. */
function subset(config: ConsentConfig): unknown {
    return {
        version: config.version,
        cookie: { name: config.cookie.name, versionName: config.cookie.versionName, domain: config.cookie.domain },
        categories: config.categories.map((category) => ({ key: category.key, required: category.required })),
        google: config.google,
    };
}

describe('@consentConfig inline bootstrap — Consent Mode v2 Advanced', () => {
    let env: TestEnv;
    let reload: ReturnType<typeof vi.fn<() => void>>;

    beforeEach(() => {
        vi.useFakeTimers();
        env = makeEnv();
        reload = vi.fn<() => void>();
        overrides = {};
    });

    afterEach(async () => {
        await env.close();
        vi.useRealTimers();
    });

    let overrides: Partial<ConsentConfig> = {};

    const config = (google: GoogleConfig = makeGoogle()): ConsentConfig => makeConfig({ ...overrides, google });

    /** Runs the shipped script the way the printed `(function…)(config, window)` call does. */
    const boot = (google: GoogleConfig = makeGoogle()): void => {
        const bootstrap = new Function(`return (${bootstrapSource});`)() as Bootstrap;

        bootstrap(subset(config(google)), env.win);
    };

    const make = (google: GoogleConfig = makeGoogle(), options: Record<string, unknown> = {}): ConsentManager =>
        createConsent(config(google), { document: env.doc, window: env.win, reload, ...options });

    const layer = (): unknown[] => {
        const data = (env.win as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];

        return data.map((entry) => (Object.prototype.toString.call(entry) === '[object Arguments]'
            ? Array.from(entry as ArrayLike<unknown>)
            : entry));
    };

    const push = (entry: unknown): void => {
        (env.win as unknown as { dataLayer: unknown[] }).dataLayer.push(entry);
    };

    const scripts = (): string[] =>
        Array.from(env.doc.querySelectorAll('script[src*="googletagmanager"]')).map((el) => el.getAttribute('src') ?? '');

    const defaults = (): unknown[] => layer().filter((entry) => Array.isArray(entry) && entry[1] === 'default');

    const events = (name: string): unknown[] => layer().filter((entry) => (entry as { event?: string }).event === name);

    it('sends default all denied → set → consent_granted → gtm.start → script for a first visitor', () => {
        boot(makeGoogle({ adsDataRedaction: true, urlPassthrough: true }));

        expect(layer()).toEqual([
            ['consent', 'default', ALL_DENIED],
            ['set', 'ads_data_redaction', true],
            ['set', 'url_passthrough', true],
            { consent_granted: ['necessary'] },
            GTM_START,
        ]);
        expect(scripts()).toEqual([CONTAINER_SRC]);
        expect(env.doc.querySelector('script[src*="gtm.js"]')?.hasAttribute('async')).toBe(true);
    });

    it('keeps an inline application push behind the default, and the core adds nothing before or after it', () => {
        boot();
        push({ event: 'purchase', ecommerce: { value: 1 } });

        const consent = make();
        vi.runAllTimers();

        expect(layer()).toEqual([
            ['consent', 'default', ALL_DENIED],
            { consent_granted: ['necessary'] },
            GTM_START,
            { event: 'purchase', ecommerce: { value: 1 } },
        ]);
        expect(scripts()).toEqual([CONTAINER_SRC]);
        expect(consent.state().decided).toBe(false);
    });

    it('starts a returning visitor who accepted from the cookie, and reloads once on a revoke', () => {
        // Encoded as the core writes it.
        seedCookies(env.doc, '__cookie_consent=necessary%2Canalytics%2Cmarketing; __cookie_consent_v=2026-10');

        boot();
        const consent = make();

        expect(layer()).toEqual([
            ['consent', 'default', ALL_GRANTED],
            { consent_granted: ['necessary', 'analytics', 'marketing'] },
            GTM_START,
        ]);

        consent.save(['marketing']);
        tick();

        expect(reload).toHaveBeenCalledTimes(1);
        expect(layer().slice(-3)).toEqual([
            ['consent', 'update', { analytics_storage: 'denied', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' }],
            RESET,
            { event: 'consent_update', consent_granted: ['necessary', 'marketing'] },
        ]);
    });

    it('starts a returning visitor who rejected with everything denied, without a reload on a reject', () => {
        seedCookies(env.doc, '__cookie_consent=necessary; __cookie_consent_v=2026-10');

        boot();
        const consent = make();

        expect(layer()[0]).toEqual(['consent', 'default', ALL_DENIED]);
        expect(scripts()).toEqual([CONTAINER_SRC]);

        consent.rejectAll();
        tick();

        expect(reload).not.toHaveBeenCalled();
    });

    it('treats a decision stored for an older version as none', () => {
        seedCookies(env.doc, '__cookie_consent=necessary,analytics,marketing; __cookie_consent_v=2025-01');

        boot();
        make();

        expect(layer()[0]).toEqual(['consent', 'default', ALL_DENIED]);
        expect(defaults()).toHaveLength(1);
        expect(events('consent_update')).toEqual([]);
    });

    it('sends update, reset and event on accept and on a later reject, which reloads', () => {
        boot();
        const consent = make();
        const before = layer().length;

        consent.acceptAll();
        consent.rejectAll();
        tick();

        expect(layer().slice(before)).toEqual([
            ['consent', 'update', ALL_GRANTED],
            RESET,
            { event: 'consent_update', consent_granted: ['necessary', 'analytics', 'marketing'] },
            ['consent', 'update', ALL_DENIED],
            RESET,
            { event: 'consent_update', consent_granted: ['necessary'] },
        ]);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('does not reload on a first-visit reject', () => {
        boot();
        const consent = make();

        consent.rejectAll();
        tick();

        expect(reload).not.toHaveBeenCalled();
        expect(layer().slice(-1)).toEqual([{ event: 'consent_update', consent_granted: ['necessary'] }]);
    });

    it('loads and configures every gtag tag, and the core configures none again', () => {
        const google = makeGoogle({ tags: [{ id: 'G-TEST', category: 'analytics' }, { id: 'AW-TEST', category: 'marketing' }], containers: [] });

        boot(google);
        const consent = make(google);
        consent.acceptAll();

        expect(layer()).toEqual([
            ['consent', 'default', ALL_DENIED],
            ['js', expect.any(Date)],
            ['config', 'G-TEST'],
            ['config', 'AW-TEST'],
            ['consent', 'update', ALL_GRANTED],
        ]);
        expect(scripts()).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-TEST']);
    });

    it('reloads when a tag category granted on a returning visit is revoked', () => {
        seedCookies(env.doc, '__cookie_consent=necessary,analytics; __cookie_consent_v=2026-10');
        const google = makeGoogle({ tags: [{ id: 'G-TEST', category: 'analytics' }], containers: [] });

        boot(google);
        const consent = make(google);
        consent.rejectAll();
        tick();

        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('never sends a second default or container on sync(), livewire:navigated, pageshow or a re-run', () => {
        boot();
        const consent = make();

        consent.acceptAll();
        consent.sync();
        env.dispatch('livewire:navigated');
        env.dispatch('visibilitychange');
        env.win.dispatchEvent(Object.assign(new (env.win as unknown as typeof globalThis).Event('pageshow'), { persisted: true }));
        // Livewire navigate or a second @consentConfig may evaluate the inline script again.
        boot();
        vi.runAllTimers();

        expect(defaults()).toHaveLength(1);
        expect(scripts()).toEqual([CONTAINER_SRC]);
        expect(events('gtm.js')).toHaveLength(1);
    });

    it('lets a second core on the page adopt the state the first one sent', () => {
        boot();
        make().acceptAll();
        const before = layer().length;

        make();

        expect(layer().slice(before)).toEqual([]);
    });

    it('sends an update when the core reads another decision than the bootstrap sent', () => {
        boot();
        // Made in another tab between the inline script and the bundle.
        seedCookies(env.doc, '__cookie_consent=necessary,analytics; __cookie_consent_v=2026-10');

        make();

        expect(layer().slice(-3)).toEqual([
            ['consent', 'update', ANALYTICS_ONLY],
            RESET,
            { event: 'consent_update', consent_granted: ['necessary', 'analytics'] },
        ]);
        expect(defaults()).toHaveLength(1);
    });

    it('sends an update when only a category no signal maps to differs', () => {
        const base = makeConfig();
        overrides = {
            categories: [...base.categories, { key: 'preferences', required: false, label: 'Preferences', description: 'Prefs', cookies: [] }],
        };

        boot();
        seedCookies(env.doc, '__cookie_consent=necessary,preferences; __cookie_consent_v=2026-10');
        make();

        expect(layer().slice(-3)).toEqual([
            ['consent', 'update', ALL_DENIED],
            RESET,
            { event: 'consent_update', consent_granted: ['necessary', 'preferences'] },
        ]);
    });

    it('ignores a legacy host-only grant with cookie.domain set, as the core does (M1b)', async () => {
        await env.close();
        env = makeEnv('http://www.example.test/');
        const base = makeConfig();
        overrides = { cookie: { ...base.cookie, domain: '.example.test' } };

        // A legacy host-only grant on www; the visitor rejected on a sibling subdomain (Domain cookies).
        seedCookies(env.doc, '__cookie_consent=necessary,analytics,marketing');
        tick();
        env.doc.cookie = '__cookie_consent=necessary; Path=/; Domain=example.test';
        env.doc.cookie = '__cookie_consent_v=2026-10; Path=/; Domain=example.test';

        boot();
        make();

        expect(layer()[0]).toEqual(['consent', 'default', ALL_DENIED]);
        expect(layer().filter((entry) => Array.isArray(entry) && entry[1] === 'update')).toEqual([]);
    });

    it('copies the CSP nonce of its own script element onto the loaders', () => {
        const google = makeGoogle({ tags: [{ id: 'G-TEST', category: 'analytics' }] });
        const own = env.doc.createElement('script');
        own.setAttribute('nonce', 'n0nce');
        Object.defineProperty(env.doc, 'currentScript', { configurable: true, get: () => own });

        boot(google);

        const loaders = Array.from(env.doc.querySelectorAll('script[src*="googletagmanager"]'));
        expect(loaders).toHaveLength(2);
        expect(loaders.map((el) => el.getAttribute('nonce'))).toEqual(['n0nce', 'n0nce']);
    });

    it('writes the marker name the core reads', () => {
        boot();

        expect((env.win as unknown as Record<string, unknown>)[GOOGLE_BOOT_MARKER]).toEqual({
            signals: ALL_DENIED,
            granted: ['necessary'],
            tags: [],
            containers: ['GTM-TEST'],
        });
    });

    it('pushes no initial consent_granted with the update event off', () => {
        boot(makeGoogle({ updateEvent: null }));

        expect(layer()).toEqual([['consent', 'default', ALL_DENIED], GTM_START]);
    });
});
