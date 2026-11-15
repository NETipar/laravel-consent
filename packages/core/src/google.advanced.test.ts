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

const ALL_DENIED = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
const ALL_GRANTED = { analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' };
const ANALYTICS_ONLY = { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };

const GTM_START = { 'gtm.start': expect.any(Number), event: 'gtm.js' };

const RESET = { consent_granted: null };

const CONTAINER_SRC = 'https://www.googletagmanager.com/gtm.js?id=GTM-TEST';

describe('attachGoogle — Consent Mode v2 Advanced', () => {
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

    /** The dataLayer, normalised: gtag `arguments` objects become arrays, GTM pushes stay objects. */
    const layer = (): unknown[] => {
        const data = (env.win as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];

        return data.map((entry) => (Object.prototype.toString.call(entry) === '[object Arguments]'
            ? Array.from(entry as ArrayLike<unknown>)
            : entry));
    };

    const scripts = (): string[] =>
        Array.from(env.doc.querySelectorAll('script[src*="googletagmanager"]')).map((el) => el.getAttribute('src') ?? '');

    const events = (name: string): unknown[] => layer().filter((entry) => (entry as { event?: string }).event === name);

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

    /** A visitor who decided on an earlier page view: the cookie is written without Google attached. */
    const decidedEarlier = (decide: (consent: ConsentManager) => void): void => {
        decide(make(makeGoogle(), { google: false }));
    };

    it('loads the container before any decision: default all denied → set → gtm.start → script', () => {
        make(makeGoogle({ adsDataRedaction: true, urlPassthrough: true }));
        const insertions = recordInsertions();

        // Deferred like every first load; nothing is on the page yet.
        expect(scripts()).toEqual([]);
        vi.runAllTimers();

        expect(layer()).toEqual([
            ['consent', 'default', ALL_DENIED],
            ['set', 'ads_data_redaction', true],
            ['set', 'url_passthrough', true],
            GTM_START,
        ]);
        expect(insertions).toEqual([{ src: CONTAINER_SRC, layerLength: 4 }]);
        expect(env.doc.querySelector('script[src*="gtm.js"]')?.hasAttribute('async')).toBe(true);
        expect(reload).not.toHaveBeenCalled();
    });

    it('loads a container whose categories are not granted', () => {
        make(makeGoogle({ containers: [{ id: 'GTM-ADS', categories: ['marketing'] }] }));
        vi.runAllTimers();

        expect(scripts()).toEqual(['https://www.googletagmanager.com/gtm.js?id=GTM-ADS']);
    });

    it('sends consent update, the reset and the update event after accepting, with no second load', () => {
        const consent = make();
        vi.runAllTimers();
        const before = layer().length;

        consent.acceptAll();

        expect(layer().slice(before)).toEqual([
            ['consent', 'update', ALL_GRANTED],
            RESET,
            { event: 'consent_update', consent_granted: ['necessary', 'analytics', 'marketing'] },
        ]);
        expect(scripts()).toEqual([CONTAINER_SRC]);
        expect(events('gtm.js')).toHaveLength(1);
        expect(layer().filter((entry) => Array.isArray(entry) && entry[1] === 'default')).toHaveLength(1);
    });

    it('sends the denied update and the event on a first-visit reject, without a reload', () => {
        const consent = make();
        vi.runAllTimers();
        const before = layer().length;

        consent.rejectAll();
        tick();

        expect(layer().slice(before)).toEqual([
            ['consent', 'update', ALL_DENIED],
            RESET,
            { event: 'consent_update', consent_granted: ['necessary'] },
        ]);
        expect(reload).not.toHaveBeenCalled();
    });

    it('reloads when a category granted after the load is revoked', () => {
        const consent = make();
        vi.runAllTimers();

        consent.acceptAll();
        tick();
        expect(reload).not.toHaveBeenCalled();

        consent.save(['marketing']);
        tick();

        expect(reload).toHaveBeenCalledTimes(1);
        expect(layer().slice(-3)).toEqual([
            ['consent', 'update', { analytics_storage: 'denied', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' }],
            RESET,
            { event: 'consent_update', consent_granted: ['necessary', 'marketing'] },
        ]);
    });

    it('starts a returning visitor from the stored decision and reloads when it is revoked', () => {
        decidedEarlier((consent) => consent.save(['analytics']));

        const consent = make();
        vi.runAllTimers();

        expect(layer()[0]).toEqual(['consent', 'default', ANALYTICS_ONLY]);
        expect(scripts()).toEqual([CONTAINER_SRC]);

        consent.rejectAll();
        tick();

        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('loads for a returning visitor who rejected, with everything denied', () => {
        decidedEarlier((consent) => consent.rejectAll());

        const consent = make();
        vi.runAllTimers();

        expect(layer()[0]).toEqual(['consent', 'default', ALL_DENIED]);
        expect(scripts()).toEqual([CONTAINER_SRC]);

        consent.rejectAll();
        tick();
        expect(reload).not.toHaveBeenCalled();
    });

    it('reloads only for the container\'s own categories', () => {
        const consent = make(makeGoogle({ containers: [{ id: 'GTM-ADS', categories: ['marketing'] }] }));
        vi.runAllTimers();

        consent.save(['analytics']);
        consent.save([]);
        tick();
        expect(reload).not.toHaveBeenCalled();

        consent.save(['marketing']);
        consent.save([]);
        tick();
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('takes a decision made before the deferred load as the default, with no update event', () => {
        const consent = make();

        consent.acceptAll();
        vi.runAllTimers();

        expect(layer()).toEqual([['consent', 'default', ALL_GRANTED], GTM_START]);
        expect(events('consent_update')).toEqual([]);
    });

    it('loads and configures every gtag tag before any decision, once', () => {
        const google = makeGoogle({
            tags: [{ id: 'G-TEST', category: 'analytics' }, { id: 'AW-TEST', category: 'marketing' }],
            containers: [],
        });
        const consent = make(google);
        vi.runAllTimers();

        expect(layer()).toEqual([
            ['consent', 'default', ALL_DENIED],
            ['js', expect.any(Date)],
            ['config', 'G-TEST'],
            ['config', 'AW-TEST'],
        ]);
        expect(scripts()).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-TEST']);

        consent.acceptAll();

        // A gtag-only page pushes no update event.
        expect(layer().slice(-1)).toEqual([['consent', 'update', ALL_GRANTED]]);
        expect(layer().filter((entry) => Array.isArray(entry) && entry[0] === 'config')).toHaveLength(2);
        expect(scripts()).toHaveLength(1);
    });

    it('reloads when a tag category granted after the load is revoked, not on a first reject', () => {
        const google = makeGoogle({ tags: [{ id: 'G-TEST', category: 'analytics' }], containers: [] });
        const first = make(google);
        vi.runAllTimers();

        first.rejectAll();
        tick();
        expect(reload).not.toHaveBeenCalled();

        first.save(['analytics']);
        tick();
        first.save([]);
        tick();
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('never injects a second container on sync(), livewire:navigated, visibilitychange or pageshow', () => {
        const consent = make();
        vi.runAllTimers();

        consent.acceptAll();
        consent.sync();
        env.dispatch('livewire:navigated');
        env.dispatch('visibilitychange');
        env.win.dispatchEvent(Object.assign(new (env.win as unknown as typeof globalThis).Event('pageshow'), { persisted: true }));
        vi.runAllTimers();

        expect(scripts()).toEqual([CONTAINER_SRC]);
        expect(events('gtm.js')).toHaveLength(1);
    });

    it('loads nothing before a decision with mode basic, as when the server omits the mode', () => {
        make(makeGoogle({ mode: 'basic' }));
        vi.runAllTimers();

        expect(layer()).toEqual([]);
        expect(scripts()).toEqual([]);
    });
});
