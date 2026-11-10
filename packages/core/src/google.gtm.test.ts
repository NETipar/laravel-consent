import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeConfig, makeEnv, tick } from './__tests__/support';
import type { TestEnv } from './__tests__/support';
import { createConsent } from './consent';
import type { ConsentConfig, ConsentManager } from './types';

type GoogleConfig = NonNullable<ConsentConfig['google']>;

const SIGNALS = {
    analytics_storage: 'analytics',
    ad_storage: 'marketing',
    ad_user_data: 'marketing',
    ad_personalization: 'marketing',
};

function makeGoogle(overrides: Partial<GoogleConfig> = {}): GoogleConfig {
    return {
        tags: [],
        containers: [{ id: 'GTM-TEST', categories: ['analytics', 'marketing'] }],
        signals: { ...SIGNALS },
        adsDataRedaction: false,
        urlPassthrough: false,
        updateEvent: 'consent_update',
        ...overrides,
    };
}

const ALL_DENIED = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
const ALL_GRANTED = { analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' };
const ANALYTICS_ONLY = { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };

const GTM_START = { 'gtm.start': expect.any(Number), event: 'gtm.js' };

/** Pushed before every update event so GTM's array merge cannot keep revoked categories. */
const RESET = { consent_granted: null };

describe('attachGoogle — Google Tag Manager containers (Consent Mode v2 Basic)', () => {
    let env: TestEnv;
    let reload: ReturnType<typeof vi.fn<() => void>>;

    beforeEach(() => {
        vi.useFakeTimers();
        env = makeEnv();
        reload = vi.fn<() => void>();
    });

    afterEach(async () => {
        await env.close();
        vi.useRealTimers();
    });

    const make = (google: GoogleConfig = makeGoogle(), options: Record<string, unknown> = {}): ConsentManager =>
        createConsent(makeConfig({ google }), { document: env.doc, window: env.win, reload, ...options });

    /**
     * The dataLayer, normalised: gtag pushes `arguments` objects (→ arrays),
     * GTM pushes plain objects (kept as objects).
     */
    const layer = (): unknown[] => {
        const data = (env.win as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];

        return data.map((entry) => (Object.prototype.toString.call(entry) === '[object Arguments]'
            ? Array.from(entry as ArrayLike<unknown>)
            : entry));
    };

    const scripts = (): string[] =>
        Array.from(env.doc.querySelectorAll('script[src*="googletagmanager"]')).map((el) => el.getAttribute('src') ?? '');

    /** Records the dataLayer length at the moment each loader script is inserted. */
    const recordInsertions = (): Array<{ src: string; layerLength: number }> => {
        const head = env.doc.head;
        const append = head.appendChild.bind(head);
        const insertions: Array<{ src: string; layerLength: number }> = [];

        head.appendChild = ((node: Node) => {
            insertions.push({
                src: (node as HTMLScriptElement).getAttribute?.('src') ?? '',
                layerLength: (env.win as unknown as { dataLayer?: unknown[] }).dataLayer?.length ?? 0,
            });

            return append(node);
        }) as typeof head.appendChild;

        return insertions;
    };

    it('loads nothing and creates no dataLayer before a decision', () => {
        make();
        vi.runAllTimers();

        expect(layer()).toEqual([]);
        expect((env.win as unknown as { gtag?: unknown }).gtag).toBeUndefined();
        expect(scripts()).toEqual([]);
    });

    it('loads nothing when only the required category is granted', () => {
        const consent = make();

        consent.rejectAll();
        vi.runAllTimers();
        consent.save([]);
        vi.runAllTimers();

        expect(layer()).toEqual([]);
        expect(scripts()).toEqual([]);
    });

    it.each([['analytics'], ['marketing']])('loads the container once %s (any of its categories) is granted', (category) => {
        const consent = make();

        consent.save([category]);
        expect(scripts()).toEqual([]);
        vi.runAllTimers();

        expect(scripts()).toEqual(['https://www.googletagmanager.com/gtm.js?id=GTM-TEST']);
        expect(env.doc.querySelector('script[src*="gtm.js"]')?.hasAttribute('async')).toBe(true);
    });

    it('does not load a container whose own categories are not granted', () => {
        const consent = make(makeGoogle({ containers: [{ id: 'GTM-ADS', categories: ['marketing'] }] }));

        consent.save(['analytics']);
        vi.runAllTimers();

        expect(scripts()).toEqual([]);
        expect(layer()).toEqual([]);
    });

    it('sends default → set → gtm.start → script, with no gtag js/config for the container', () => {
        const consent = make(makeGoogle({ adsDataRedaction: true, urlPassthrough: true }));
        const insertions = recordInsertions();

        consent.save(['analytics']);
        vi.runAllTimers();

        expect(layer()).toEqual([
            ['consent', 'default', ANALYTICS_ONLY],
            ['set', 'ads_data_redaction', true],
            ['set', 'url_passthrough', true],
            GTM_START,
        ]);
        expect(insertions).toEqual([{ src: 'https://www.googletagmanager.com/gtm.js?id=GTM-TEST', layerLength: 4 }]);
        expect(layer().some((entry) => Array.isArray(entry) && (entry[0] === 'js' || entry[0] === 'config'))).toBe(false);
    });

    it('stamps gtm.start with the current time', () => {
        vi.setSystemTime(new Date('2026-11-10T10:00:00Z'));
        const consent = make();

        consent.acceptAll();
        vi.runAllTimers();

        expect(layer()).toContainEqual({ 'gtm.start': Date.parse('2026-11-10T10:00:00Z'), event: 'gtm.js' });
    });

    it('shares one dataLayer and one default between tags and containers (gtag loader first)', () => {
        const google = makeGoogle({
            tags: [{ id: 'G-TEST', category: 'analytics' }],
            containers: [{ id: 'GTM-ONE', categories: ['analytics'] }, { id: 'GTM-TWO', categories: ['marketing'] }],
            urlPassthrough: true,
        });
        const consent = make(google);
        const insertions = recordInsertions();

        consent.acceptAll();
        vi.runAllTimers();

        expect(layer()).toEqual([
            ['consent', 'default', ALL_GRANTED],
            ['set', 'url_passthrough', true],
            ['js', expect.any(Date)],
            ['config', 'G-TEST'],
            GTM_START,
            GTM_START,
        ]);
        expect(insertions.map((insertion) => insertion.src)).toEqual([
            'https://www.googletagmanager.com/gtag/js?id=G-TEST',
            'https://www.googletagmanager.com/gtm.js?id=GTM-ONE',
            'https://www.googletagmanager.com/gtm.js?id=GTM-TWO',
        ]);
        // Each container's gtm.start is in the dataLayer before its script.
        expect(insertions[1].layerLength).toBe(5);
        expect(insertions[2].layerLength).toBe(6);
        expect(layer().filter((entry) => Array.isArray(entry) && entry[1] === 'default')).toHaveLength(1);
    });

    it('sends consent update, then the update event, on a later change', () => {
        const consent = make();

        consent.save(['analytics']);
        vi.runAllTimers();
        const before = layer().length;

        consent.acceptAll();

        expect(layer().slice(before)).toEqual([
            ['consent', 'update', ALL_GRANTED],
            RESET,
            { event: 'consent_update', consent_granted: ['necessary', 'analytics', 'marketing'] },
        ]);
        expect(scripts()).toHaveLength(1);
    });

    it('sends the denied update and the event when consent is narrowed', () => {
        const consent = make();

        consent.acceptAll();
        vi.runAllTimers();
        consent.save(['analytics']);
        tick();

        expect(layer().slice(-3)).toEqual([
            ['consent', 'update', ANALYTICS_ONLY],
            RESET,
            { event: 'consent_update', consent_granted: ['necessary', 'analytics'] },
        ]);
    });

    it('lets a key-merging reader (GTM Data Layer Variable, Version 2) see the narrowed list', () => {
        // GTM's data model merges plain objects and arrays recursively, index by index; anything else overwrites.
        const merge = (target: unknown, source: unknown): unknown => {
            if (Array.isArray(source)) {
                const result: unknown[] = Array.isArray(target) ? [...target] : [];
                source.forEach((value, index) => {
                    result[index] = merge(result[index], value);
                });

                return result;
            }

            if (source !== null && typeof source === 'object') {
                const result: Record<string, unknown> = target !== null && typeof target === 'object' && !Array.isArray(target)
                    ? { ...(target as Record<string, unknown>) }
                    : {};
                for (const [key, value] of Object.entries(source)) {
                    result[key] = merge(result[key], value);
                }

                return result;
            }

            return source;
        };
        const consent = make();

        consent.save(['analytics']);
        vi.runAllTimers();
        consent.acceptAll(); // event with the wide list
        consent.save(['analytics']); // event with the narrowed list

        expect(layer().filter((entry) => (entry as { event?: string }).event === 'consent_update')).toHaveLength(2);

        const model = layer()
            .filter((entry) => !Array.isArray(entry))
            .reduce<Record<string, unknown>>((state, entry) => merge(state, entry) as Record<string, unknown>, {});

        expect(model.consent_granted).toEqual(['necessary', 'analytics']);
    });

    it('uses a custom update event name', () => {
        const consent = make(makeGoogle({ updateEvent: 'cookie_consent_changed' }));

        consent.save(['analytics']);
        vi.runAllTimers();
        consent.acceptAll();

        expect(layer().slice(-1)).toEqual([{ event: 'cookie_consent_changed', consent_granted: ['necessary', 'analytics', 'marketing'] }]);
    });

    it('sends no event with updateEvent: null, but still the consent update', () => {
        const consent = make(makeGoogle({ updateEvent: null }));

        consent.save(['analytics']);
        vi.runAllTimers();
        consent.acceptAll();

        expect(layer().slice(-1)).toEqual([['consent', 'update', ALL_GRANTED]]);
        expect(layer()).not.toContainEqual(RESET);
        expect(layer().some((entry) => !Array.isArray(entry) && (entry as { event?: string }).event !== 'gtm.js')).toBe(false);
    });

    it('defaults to the consent_update event when the server omits updateEvent', () => {
        const { updateEvent: _omitted, ...google } = makeGoogle();
        const consent = make(google);

        consent.save(['analytics']);
        vi.runAllTimers();
        consent.acceptAll();

        expect(layer().slice(-1)).toEqual([{ event: 'consent_update', consent_granted: ['necessary', 'analytics', 'marketing'] }]);
    });

    it('sends no update event on the initial load', () => {
        const consent = make();

        consent.acceptAll();
        vi.runAllTimers();

        expect(layer().filter((entry) => (entry as { event?: string }).event === 'consent_update')).toEqual([]);
    });

    it('loads a container that becomes eligible later exactly once, after the update, with no event before it is on the page', () => {
        const google = makeGoogle({
            tags: [{ id: 'G-TEST', category: 'analytics' }],
            containers: [{ id: 'GTM-ADS', categories: ['marketing'] }],
        });
        const consent = make(google);

        consent.save(['analytics']);
        vi.runAllTimers();
        expect(scripts()).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-TEST']);
        const before = layer().length;

        consent.acceptAll();
        consent.save(['analytics', 'marketing']);
        consent.sync();
        vi.runAllTimers();

        expect(layer().slice(before, before + 2)).toEqual([
            ['consent', 'update', ALL_GRANTED],
            GTM_START,
        ]);
        expect(layer().filter((entry) => (entry as { event?: string }).event === 'consent_update')).toEqual([]);
        expect(scripts()).toEqual([
            'https://www.googletagmanager.com/gtag/js?id=G-TEST',
            'https://www.googletagmanager.com/gtm.js?id=GTM-ADS',
        ]);
        expect(layer().filter((entry) => (entry as { event?: string }).event === 'gtm.js')).toHaveLength(1);
    });

    it('sends the event before a second container that becomes eligible later loads', () => {
        const google = makeGoogle({
            containers: [{ id: 'GTM-ONE', categories: ['analytics'] }, { id: 'GTM-TWO', categories: ['marketing'] }],
        });
        const consent = make(google);

        consent.save(['analytics']);
        vi.runAllTimers();
        const before = layer().length;

        consent.acceptAll();

        expect(layer().slice(before)).toEqual([
            ['consent', 'update', ALL_GRANTED],
            RESET,
            { event: 'consent_update', consent_granted: ['necessary', 'analytics', 'marketing'] },
            GTM_START,
        ]);
        expect(scripts()).toEqual([
            'https://www.googletagmanager.com/gtm.js?id=GTM-ONE',
            'https://www.googletagmanager.com/gtm.js?id=GTM-TWO',
        ]);
    });

    it('pushes no update events while only the gtag loader is on the page', () => {
        const google = makeGoogle({
            tags: [{ id: 'G-TEST', category: 'analytics' }],
            containers: [{ id: 'GTM-ADS', categories: ['marketing'] }],
        });
        const consent = make(google);

        consent.save(['analytics']);
        vi.runAllTimers();
        consent.save([]);
        consent.save(['analytics']);

        expect(scripts()).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-TEST']);
        expect(layer().filter((entry) => (entry as { event?: string }).event === 'consent_update')).toEqual([]);
    });

    it('loads the gtag loader late when a container loaded first', () => {
        const google = makeGoogle({
            tags: [{ id: 'AW-TEST', category: 'marketing' }],
            containers: [{ id: 'GTM-TEST', categories: ['analytics'] }],
        });
        const consent = make(google);

        consent.save(['analytics']);
        vi.runAllTimers();
        consent.acceptAll();

        expect(scripts()).toEqual([
            'https://www.googletagmanager.com/gtm.js?id=GTM-TEST',
            'https://www.googletagmanager.com/gtag/js?id=AW-TEST',
        ]);
        expect(layer().slice(-5)).toEqual([
            ['consent', 'update', ALL_GRANTED],
            RESET,
            { event: 'consent_update', consent_granted: ['necessary', 'analytics', 'marketing'] },
            ['js', expect.any(Date)],
            ['config', 'AW-TEST'],
        ]);
        expect(layer().filter((entry) => Array.isArray(entry) && entry[1] === 'default')).toHaveLength(1);
    });

    it('reloads when a category the container loaded for is revoked', () => {
        const consent = make();

        consent.save(['analytics']);
        vi.runAllTimers();
        expect(reload).not.toHaveBeenCalled();

        consent.rejectAll();
        tick();

        expect(reload).toHaveBeenCalledTimes(1);
        expect(layer().slice(-3)).toEqual([
            ['consent', 'update', ALL_DENIED],
            RESET,
            { event: 'consent_update', consent_granted: ['necessary'] },
        ]);
    });

    it('marks a category granted after the container loaded, so revoking only it reloads too', () => {
        const consent = make();

        consent.save(['analytics']);
        vi.runAllTimers();
        consent.acceptAll();
        tick();
        expect(reload).not.toHaveBeenCalled();

        consent.save(['analytics']);
        tick();

        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('does not reload when nothing was loaded yet (revoked before the deferred load ran)', () => {
        const consent = make();

        consent.save(['analytics']);
        consent.rejectAll();
        vi.runAllTimers();

        expect(scripts()).toEqual([]);
        expect(reload).not.toHaveBeenCalled();
    });

    it('never injects a second container script on sync(), livewire:navigated, visibilitychange or pageshow', () => {
        const consent = make();

        consent.acceptAll();
        vi.runAllTimers();

        // Real changes reach the loader (unchanged decisions stop at the manager).
        consent.save(['analytics']);
        consent.acceptAll();
        consent.sync();
        consent.sync(env.doc.body);
        env.dispatch('livewire:navigated');
        env.dispatch('visibilitychange');
        env.win.dispatchEvent(Object.assign(new (env.win as unknown as typeof globalThis).Event('pageshow'), { persisted: true }));
        vi.runAllTimers();

        expect(scripts()).toEqual(['https://www.googletagmanager.com/gtm.js?id=GTM-TEST']);
        expect(layer().filter((entry) => (entry as { event?: string }).event === 'gtm.js')).toHaveLength(1);
        expect(layer().filter((entry) => Array.isArray(entry) && entry[1] === 'default')).toHaveLength(1);
    });

    it('loads on attach for a visitor who decided on an earlier page (Inertia/Livewire first visit)', () => {
        make(makeGoogle(), { google: false }).save(['marketing']);

        make();
        vi.runAllTimers();

        expect(scripts()).toEqual(['https://www.googletagmanager.com/gtm.js?id=GTM-TEST']);
        expect(layer()[0]).toEqual(['consent', 'default', { analytics_storage: 'denied', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' }]);
    });

    it('does not inject the container again when another manager on the page already did', () => {
        make().acceptAll();
        vi.runAllTimers();

        make();
        vi.runAllTimers();

        expect(scripts()).toEqual(['https://www.googletagmanager.com/gtm.js?id=GTM-TEST']);
        expect(layer().filter((entry) => (entry as { event?: string }).event === 'gtm.js')).toHaveLength(1);
    });
});
