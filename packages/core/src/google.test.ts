import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeConfig, makeEnv, tick } from './__tests__/support';
import type { TestEnv } from './__tests__/support';
import { createConsent } from './consent';
import { attachGoogle } from './google';
import type { ConsentConfig, ConsentManager } from './types';

type GoogleConfig = NonNullable<ConsentConfig['google']>;

function makeGoogle(overrides: Partial<GoogleConfig> = {}): GoogleConfig {
    return {
        tags: [
            { id: 'G-TEST', category: 'analytics' },
            { id: 'AW-TEST', category: 'marketing' },
        ],
        signals: {
            analytics_storage: 'analytics',
            ad_storage: 'marketing',
            ad_user_data: 'marketing',
            ad_personalization: 'marketing',
        },
        adsDataRedaction: false,
        urlPassthrough: false,
        ...overrides,
    };
}

const ALL_DENIED = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
const ALL_GRANTED = { analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' };

describe('attachGoogle (Consent Mode v2 Basic)', () => {
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

    const make = (google: GoogleConfig | null = makeGoogle(), options: Record<string, unknown> = {}): ConsentManager =>
        createConsent(makeConfig({ google }), { document: env.doc, window: env.win, reload, ...options });

    /** Recorded dataLayer entries as plain arrays (gtag pushes `arguments` objects). */
    const layer = (): unknown[][] => {
        const data = (env.win as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [];

        return data.map((entry) => Array.from(entry));
    };

    const last = (): unknown[] | undefined => layer().slice(-1)[0];

    const loaders = (): string[] =>
        Array.from(env.doc.querySelectorAll('script[src*="googletagmanager"]')).map((el) => el.getAttribute('src') ?? '');

    it('loads nothing and creates no dataLayer without a decision', () => {
        make();
        vi.runAllTimers();

        expect(layer()).toEqual([]);
        expect((env.win as unknown as { gtag?: unknown }).gtag).toBeUndefined();
        expect(loaders()).toEqual([]);
    });

    it('still loads nothing after rejectAll()', () => {
        const consent = make();

        consent.rejectAll();
        vi.runAllTimers();

        expect(layer()).toEqual([]);
        expect(loaders()).toEqual([]);
    });

    it('loads with the default signals and configures only granted tags after save([analytics])', () => {
        const consent = make();

        consent.save(['analytics']);
        expect(loaders()).toEqual([]);
        vi.runAllTimers();

        expect(loaders()).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-TEST']);
        expect(env.doc.querySelector('script[src*="googletagmanager"]')?.hasAttribute('async')).toBe(true);

        const recorded = layer();
        expect(recorded).toEqual([
            ['consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }],
            ['js', expect.any(Date)],
            ['config', 'G-TEST'],
        ]);
        expect(recorded).not.toContainEqual(['config', 'AW-TEST']);
    });

    it('sends an update and configures the newly granted tag on acceptAll(), without re-configuring', () => {
        const consent = make();

        consent.save(['analytics']);
        vi.runAllTimers();
        consent.acceptAll();
        vi.runAllTimers();

        const recorded = layer();
        expect(recorded.slice(3)).toEqual([
            ['consent', 'update', ALL_GRANTED],
            ['config', 'AW-TEST'],
        ]);
        expect(recorded.filter((entry) => entry[0] === 'config' && entry[1] === 'G-TEST')).toHaveLength(1);
        expect(loaders()).toHaveLength(1);
    });

    it('loads on attach when a valid decision cookie exists at page load', () => {
        make(makeGoogle(), { google: false }).acceptAll();
        expect(layer()).toEqual([]);

        make();
        vi.runAllTimers();

        expect(loaders()).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-TEST']);
        expect(layer()).toEqual([
            ['consent', 'default', ALL_GRANTED],
            ['js', expect.any(Date)],
            ['config', 'G-TEST'],
            ['config', 'AW-TEST'],
        ]);
    });

    it('sends update with denied values on withdraw() and keeps the loader', () => {
        const consent = make();

        consent.acceptAll();
        vi.runAllTimers();
        consent.withdraw();
        tick();

        expect(last()).toEqual(['consent', 'update', ALL_DENIED]);
        expect(loaders()).toHaveLength(1);
    });

    it('sets ads_data_redaction and url_passthrough before the loader is inserted', () => {
        const google = makeGoogle({ adsDataRedaction: true, urlPassthrough: true });
        const consent = make(google);
        const win = env.win as unknown as { dataLayer?: unknown[] };

        // Record how long the dataLayer was when the loader script got inserted.
        const originalHead = env.doc.head;
        const append = originalHead.appendChild.bind(originalHead);
        const insertedAfter: number[] = [];
        originalHead.appendChild = ((node: Node) => {
            insertedAfter.push(win.dataLayer?.length ?? 0);

            return append(node);
        }) as typeof originalHead.appendChild;

        consent.acceptAll();
        vi.runAllTimers();

        const recorded = layer();
        const redaction = recorded.findIndex((entry) => entry[0] === 'set' && entry[1] === 'ads_data_redaction');
        const passthrough = recorded.findIndex((entry) => entry[0] === 'set' && entry[1] === 'url_passthrough');

        expect(recorded[redaction]).toEqual(['set', 'ads_data_redaction', true]);
        expect(recorded[passthrough]).toEqual(['set', 'url_passthrough', true]);
        expect(loaders()).toHaveLength(1);
        expect(insertedAfter).toHaveLength(1);
        expect(redaction).toBeLessThan(insertedAfter[0]);
        expect(passthrough).toBeLessThan(insertedAfter[0]);
    });

    it('is a no-op when google is null', () => {
        const consent = make(null);

        consent.acceptAll();
        vi.runAllTimers();

        expect(layer()).toEqual([]);
        expect(loaders()).toEqual([]);

        const manager = { config: makeConfig({ google: null }), onChange: vi.fn(), has: vi.fn(), markLoaded: vi.fn() };
        const detach = attachGoogle(manager as unknown as ConsentManager, env.win);

        expect(manager.onChange).not.toHaveBeenCalled();
        expect(() => detach()).not.toThrow();
    });

    it('marks the category as loaded so a later revoke reloads once, after the denied update', () => {
        const consent = make();
        const events: string[] = [];

        reload.mockImplementation(() => {
            events.push(`reload:${JSON.stringify(last())}`);
        });

        consent.save(['analytics']);
        vi.runAllTimers();
        expect(reload).not.toHaveBeenCalled();

        consent.rejectAll();
        tick();

        expect(reload).toHaveBeenCalledTimes(1);
        expect(last()).toEqual(['consent', 'update', ALL_DENIED]);
        expect(events).toEqual([`reload:${JSON.stringify(['consent', 'update', ALL_DENIED])}`]);
    });

    it('cancels a deferred load when consent is revoked before it runs (nothing loaded, no reload)', () => {
        const consent = make();

        consent.save(['marketing']);
        consent.rejectAll();
        vi.runAllTimers();

        expect(loaders()).toEqual([]);
        expect(reload).not.toHaveBeenCalled();
    });

    it('schedules only one load for several changes before it runs', () => {
        const consent = make();

        consent.save(['analytics']);
        consent.acceptAll();
        vi.runAllTimers();

        expect(loaders()).toHaveLength(1);
        expect(layer().filter((entry) => entry[0] === 'consent' && entry[1] === 'default')).toHaveLength(1);
        expect(layer()[0]).toEqual(['consent', 'default', ALL_GRANTED]);
    });

    it('defers via requestIdleCallback when available', () => {
        const idle: Array<() => void> = [];
        const timeouts: Array<number | undefined> = [];
        (env.win as unknown as { requestIdleCallback: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback = (cb, options) => {
            timeouts.push(options?.timeout);

            return idle.push(cb);
        };

        const consent = make();
        consent.acceptAll();
        vi.runAllTimers();

        expect(loaders()).toEqual([]);
        expect(idle).toHaveLength(1);
        expect(timeouts).toEqual([2000]);

        idle[0]();

        expect(loaders()).toHaveLength(1);
    });

    it('stops reacting after detach()', () => {
        const consent = make(makeGoogle(), { google: false });
        const detach = attachGoogle(consent, env.win);

        detach();
        consent.acceptAll();
        vi.runAllTimers();

        expect(loaders()).toEqual([]);
        expect(layer()).toEqual([]);
    });
});
