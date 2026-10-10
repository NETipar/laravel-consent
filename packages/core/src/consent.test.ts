import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeConfig, makeEnv, seedCookies, tick } from './__tests__/support';
import type { TestEnv } from './__tests__/support';
import { createConsent } from './consent';
import { readCookie } from './cookies';
import { writeState } from './state';
import { CHANGE_EVENT, ConsentError } from './types';
import type { ConsentConfig, CreateConsentOptions } from './types';

const THIRD_PARTY = '_ga=1; _ga_ABC=2; _gid=3; _gcl_au=4; _gcl_aw=5; keep_me=6; XSRF-TOKEN=7';

describe('createConsent', () => {
    let env: TestEnv;

    const create = (config: ConsentConfig = makeConfig(), options: CreateConsentOptions = {}) =>
        createConsent(config, { document: env.doc, window: env.win, ...options });

    beforeEach(() => {
        vi.useFakeTimers();
        env = makeEnv();
    });

    afterEach(async () => {
        await env.close();
        vi.useRealTimers();
    });

    describe('state', () => {
        it('starts undecided on a fresh document with the prompt open', () => {
            const consent = create();

            expect(consent.state()).toEqual({ decided: false, granted: ['necessary'], version: null });
            expect(consent.ui()).toEqual({ promptOpen: true, settingsOpen: false });
            expect(consent.hasDecision()).toBe(false);
            expect(consent.has('necessary')).toBe(true);
            expect(consent.has('analytics')).toBe(false);
        });

        it('acceptAll writes both cookies, closes the prompt, notifies once and dispatches consent:change', () => {
            const consent = create();
            const onChange = vi.fn();
            const onEvent = vi.fn();
            consent.onChange(onChange);
            env.doc.addEventListener(CHANGE_EVENT, onEvent);

            consent.acceptAll();

            expect(env.doc.cookie).toContain('__cookie_consent=necessary%2Canalytics%2Cmarketing');
            expect(env.doc.cookie).toContain('__cookie_consent_v=2026-10');
            expect(consent.ui().promptOpen).toBe(false);
            expect(onChange).toHaveBeenCalledTimes(1);
            expect(onChange).toHaveBeenCalledWith(
                { decided: true, granted: ['necessary', 'analytics', 'marketing'], version: '2026-10' },
                { decided: false, granted: ['necessary'], version: null },
                'accept_all',
            );
            expect(onEvent).toHaveBeenCalledTimes(1);
            expect((onEvent.mock.calls[0][0] as CustomEvent).detail).toEqual({
                state: consent.state(),
                previous: { decided: false, granted: ['necessary'], version: null },
                action: 'accept_all',
            });
        });

        it('rejectAll keeps only the required category and decides', () => {
            const consent = create();
            const onChange = vi.fn();
            consent.onChange(onChange);

            consent.rejectAll();

            expect(consent.state()).toEqual({ decided: true, granted: ['necessary'], version: '2026-10' });
            expect(readCookie(env.doc, '__cookie_consent')).toBe('necessary');
            expect(onChange).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'reject_all');
        });

        it('save keeps required + known keys in config order and ignores unknown keys', () => {
            const consent = create();

            consent.save(['marketing', 'bogus']);

            expect(readCookie(env.doc, '__cookie_consent')).toBe('necessary,marketing');
            expect(consent.has('marketing')).toBe(true);
            expect(consent.has('analytics')).toBe(false);
            expect(() => consent.has('bogus')).toThrow(ConsentError);
            expect(() => consent.has('bogus')).toThrow('consent: unknown category "bogus"');
        });

        it('treats a stale version as undecided and deletes the value cookie', () => {
            seedCookies(env.doc, '__cookie_consent=necessary%2Cmarketing; __cookie_consent_v=2025-01');

            const consent = create();
            tick();

            expect(consent.state().decided).toBe(false);
            expect(consent.has('marketing')).toBe(false);
            expect(env.doc.cookie).not.toContain('__cookie_consent=');
            expect(consent.ui().promptOpen).toBe(true);
        });

        it('treats a value cookie without a version cookie as stale', () => {
            seedCookies(env.doc, '__cookie_consent=necessary%2Cmarketing');

            const consent = create();
            tick();

            expect(consent.state().decided).toBe(false);
            expect(env.doc.cookie).not.toContain('__cookie_consent=');
        });

        it('honours valid cookies on create without notifying', () => {
            seedCookies(env.doc, '__cookie_consent=necessary%2Canalytics; __cookie_consent_v=2026-10');
            const onEvent = vi.fn();
            env.doc.addEventListener(CHANGE_EVENT, onEvent);

            const consent = create();
            const onChange = vi.fn();
            consent.onChange(onChange);

            expect(consent.state()).toEqual({ decided: true, granted: ['necessary', 'analytics'], version: '2026-10' });
            expect(consent.ui().promptOpen).toBe(false);
            expect(onChange).not.toHaveBeenCalled();
            expect(onEvent).not.toHaveBeenCalled();
        });

        it('withdraw deletes both cookies, re-opens the prompt and notifies', () => {
            const consent = create();
            consent.acceptAll();
            const onChange = vi.fn();
            consent.onChange(onChange);

            consent.withdraw();
            tick();

            expect(env.doc.cookie).not.toContain('__cookie_consent');
            expect(consent.state()).toEqual({ decided: false, granted: ['necessary'], version: null });
            expect(consent.ui().promptOpen).toBe(true);
            expect(onChange).toHaveBeenCalledTimes(1);
            expect(onChange).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'withdraw');
        });

        it('notifies only once when the same set is saved twice', () => {
            const consent = create();
            const onChange = vi.fn();
            consent.onChange(onChange);

            consent.save(['analytics']);
            consent.save(['analytics']);

            expect(onChange).toHaveBeenCalledTimes(1);
        });

        it('stops notifying an unsubscribed listener', () => {
            const consent = create();
            const onChange = vi.fn();
            const off = consent.onChange(onChange);

            off();
            consent.acceptAll();

            expect(onChange).not.toHaveBeenCalled();
        });

        it('sync picks up a decision written by another tab', () => {
            const config = makeConfig();
            const consent = create(config);
            const onChange = vi.fn();
            consent.onChange(onChange);

            writeState(config, env.doc, ['analytics']);
            consent.sync();

            expect(consent.state()).toEqual({ decided: true, granted: ['necessary', 'analytics'], version: '2026-10' });
            expect(consent.ui().promptOpen).toBe(false);
            expect(onChange).toHaveBeenCalledTimes(1);
            expect(onChange).toHaveBeenCalledWith(consent.state(), expect.objectContaining({ decided: false }), 'sync');
        });

        it('sync without any cookie change does not notify', () => {
            const consent = create();
            consent.acceptAll();
            const onChange = vi.fn();
            consent.onChange(onChange);

            consent.sync();

            expect(onChange).not.toHaveBeenCalled();
        });
    });

    describe('ui', () => {
        it('openSettings / closeSettings toggle settingsOpen and notify onUi', () => {
            const consent = create();
            const onUi = vi.fn();
            consent.onUi(onUi);

            consent.openSettings();
            expect(consent.ui()).toEqual({ promptOpen: true, settingsOpen: true });

            consent.closeSettings();
            expect(consent.ui()).toEqual({ promptOpen: true, settingsOpen: false });

            expect(onUi.mock.calls).toEqual([
                [{ promptOpen: true, settingsOpen: true }],
                [{ promptOpen: true, settingsOpen: false }],
            ]);
        });

        it('a transition closes both the prompt and the settings', () => {
            const consent = create();
            consent.openSettings();

            consent.save(['analytics']);

            expect(consent.ui()).toEqual({ promptOpen: false, settingsOpen: false });
        });

        it('dismissPrompt hides the prompt for this page view, also across sync()', () => {
            const consent = create();
            const onUi = vi.fn();
            consent.onUi(onUi);

            consent.dismissPrompt();
            expect(consent.ui().promptOpen).toBe(false);

            consent.sync();
            expect(consent.ui().promptOpen).toBe(false);
            expect(consent.hasDecision()).toBe(false);
            expect(env.doc.cookie).toBe('');
            expect(onUi).toHaveBeenCalledTimes(1);
        });

        it('a new page lifetime shows the prompt again after a dismiss', () => {
            create().dismissPrompt();

            expect(create().ui().promptOpen).toBe(true);
        });

        it('withdraw after a dismiss re-opens the prompt', () => {
            const consent = create();
            consent.dismissPrompt();
            consent.acceptAll();

            consent.withdraw();
            tick();
            consent.sync();

            expect(consent.ui().promptOpen).toBe(true);
        });
    });

    describe('livewire:navigated', () => {
        it('re-syncs on livewire:navigated', () => {
            const config = makeConfig();
            const consent = create(config);
            const onChange = vi.fn();
            consent.onChange(onChange);

            writeState(config, env.doc, ['marketing']);
            env.dispatch('livewire:navigated');

            expect(consent.has('marketing')).toBe(true);
            expect(onChange).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'sync');
        });

        it('does not listen when syncOnLivewireNavigate is false', () => {
            const config = makeConfig();
            const consent = create(config, { syncOnLivewireNavigate: false });

            writeState(config, env.doc, ['marketing']);
            env.dispatch('livewire:navigated');

            expect(consent.has('marketing')).toBe(false);
        });

        it('destroy removes the listener', () => {
            const config = makeConfig();
            const consent = create(config);
            const onChange = vi.fn();
            consent.onChange(onChange);

            consent.destroy();
            writeState(config, env.doc, ['marketing']);
            env.dispatch('livewire:navigated');

            expect(consent.has('marketing')).toBe(false);
            expect(onChange).not.toHaveBeenCalled();
        });
    });

    describe('complete withdrawal (D23)', () => {
        it('save with fewer categories purges only the removed category', () => {
            seedCookies(env.doc, THIRD_PARTY);
            const writes: string[] = [];
            const consent = create(makeConfig(), {
                writeCookie: (doc, cookieString) => {
                    writes.push(cookieString);
                    doc.cookie = cookieString;
                },
            });

            consent.acceptAll();
            expect(writes).toEqual([]);

            consent.save(['marketing']);
            tick();

            expect(new Set(writes.map((w) => w.split('=')[0]))).toEqual(new Set(['_ga', '_ga_ABC', '_gid']));
            const names = env.names();
            expect(names).not.toContain('_ga');
            expect(names).not.toContain('_ga_ABC');
            expect(names).not.toContain('_gid');
            expect(names).toEqual(expect.arrayContaining(['_gcl_au', '_gcl_aw', 'keep_me', 'XSRF-TOKEN']));
        });

        it('rejectAll purges every optional category', () => {
            seedCookies(env.doc, THIRD_PARTY);
            const consent = create();
            consent.acceptAll();
            consent.save(['marketing']);

            consent.rejectAll();
            tick();

            expect(env.names().sort()).toEqual(['XSRF-TOKEN', '__cookie_consent', '__cookie_consent_v', 'keep_me']);
        });

        it('withdraw from a full grant purges everything matching', () => {
            seedCookies(env.doc, THIRD_PARTY);
            const consent = create();
            consent.acceptAll();

            consent.withdraw();
            tick();

            expect(env.names().sort()).toEqual(['XSRF-TOKEN', 'keep_me']);
        });

        it('a stale version at create purges every optional category and expires both consent cookies', () => {
            seedCookies(env.doc, `${THIRD_PARTY}; __cookie_consent=necessary%2Canalytics%2Cmarketing; __cookie_consent_v=old`);

            create();
            tick();

            expect(env.names().sort()).toEqual(['XSRF-TOKEN', 'keep_me']);
        });

        it('a stale version at create uses the injected writer', () => {
            seedCookies(env.doc, '_ga=1; __cookie_consent=necessary%2Canalytics; __cookie_consent_v=old');
            const writes: string[] = [];

            create(makeConfig(), { writeCookie: (_doc, cookieString) => writes.push(cookieString) });

            expect(writes).toContain('_ga=; Max-Age=0; Path=/');
        });

        it('acceptAll after rejectAll purges nothing', () => {
            seedCookies(env.doc, THIRD_PARTY);
            const writes: string[] = [];
            const consent = create(makeConfig(), { writeCookie: (_doc, cookieString) => writes.push(cookieString) });
            consent.acceptAll();
            consent.rejectAll();
            expect(writes).not.toEqual([]);
            writes.length = 0;

            consent.acceptAll();

            expect(writes).toEqual([]);
        });
    });

    describe('reload on revoke (D23)', () => {
        it('reloads after onChange when a loaded category is revoked', () => {
            const reload = vi.fn();
            const consent = create(makeConfig(), { reload });
            const onChange = vi.fn();
            consent.onChange(onChange);
            consent.acceptAll();
            consent.markLoaded('analytics');

            consent.save(['marketing']);

            expect(reload).not.toHaveBeenCalled();
            vi.runAllTimers();
            expect(reload).toHaveBeenCalledTimes(1);
            expect(onChange.mock.invocationCallOrder[1]).toBeLessThan(reload.mock.invocationCallOrder[0]);
        });

        it('does not reload when the revoked category was never loaded', () => {
            const reload = vi.fn();
            const consent = create(makeConfig(), { reload });
            consent.acceptAll();

            consent.save(['marketing']);
            vi.runAllTimers();

            expect(reload).not.toHaveBeenCalled();
        });

        it('does not reload when reloadOnRevoke is false', () => {
            const reload = vi.fn();
            const consent = create(makeConfig({ reloadOnRevoke: false }), { reload });
            consent.acceptAll();
            consent.markLoaded('analytics');

            consent.save(['marketing']);
            vi.runAllTimers();

            expect(reload).not.toHaveBeenCalled();
        });

        it('does not reload when nothing is removed', () => {
            const reload = vi.fn();
            const consent = create(makeConfig(), { reload });
            consent.markLoaded('analytics');

            consent.acceptAll();
            vi.runAllTimers();

            expect(reload).not.toHaveBeenCalled();
        });

        it('reloads on withdraw of a loaded category', () => {
            const reload = vi.fn();
            const consent = create(makeConfig(), { reload });
            consent.acceptAll();
            consent.markLoaded('marketing');

            consent.withdraw();
            vi.runAllTimers();

            expect(reload).toHaveBeenCalledTimes(1);
        });
    });

    describe('cross-tab revoke via sync (D37)', () => {
        it('purges and reloads when another tab revoked a category loaded in this tab', () => {
            const config = makeConfig();
            const reload = vi.fn();
            const consent = create(config, { reload });
            consent.acceptAll();
            consent.markLoaded('analytics');
            const onChange = vi.fn();
            consent.onChange(onChange);

            writeState(config, env.doc, ['marketing']);
            seedCookies(env.doc, '_ga=1; _gid=3; _gcl_au=4');
            env.dispatch('livewire:navigated');

            expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ granted: ['necessary', 'marketing'] }), expect.anything(), 'sync');
            expect(reload).not.toHaveBeenCalled();
            vi.runAllTimers();
            expect(reload).toHaveBeenCalledTimes(1);
            expect(onChange.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]);
            tick();
            const names = env.names();
            expect(names).not.toContain('_ga');
            expect(names).not.toContain('_gid');
            expect(names).toContain('_gcl_au');
        });

        it('purges a revoke written by another tab through the injected writer, without reload when not loaded', () => {
            const config = makeConfig();
            const reload = vi.fn();
            const writes: string[] = [];
            const consent = create(config, { reload, writeCookie: (_doc, cookieString) => writes.push(cookieString) });
            consent.acceptAll();

            writeState(config, env.doc, ['analytics']);
            seedCookies(env.doc, '_gcl_au=4');
            consent.sync();
            vi.runAllTimers();

            expect(writes).toContain('_gcl_au=; Max-Age=0; Path=/');
            expect(reload).not.toHaveBeenCalled();
        });

        it('does not reload on a cross-tab revoke when reloadOnRevoke is false', () => {
            const config = makeConfig({ reloadOnRevoke: false });
            const reload = vi.fn();
            const consent = create(config, { reload });
            consent.acceptAll();
            consent.markLoaded('analytics');

            writeState(config, env.doc, []);
            consent.sync();
            vi.runAllTimers();

            expect(consent.has('analytics')).toBe(false);
            expect(reload).not.toHaveBeenCalled();
        });

        it('does not reload when another tab only adds categories', () => {
            const config = makeConfig();
            const reload = vi.fn();
            const consent = create(config, { reload });
            consent.save(['analytics']);
            consent.markLoaded('analytics');

            writeState(config, env.doc, ['analytics', 'marketing']);
            consent.sync();
            vi.runAllTimers();

            expect(reload).not.toHaveBeenCalled();
        });

        it('reloads when another tab withdrew a loaded category', () => {
            const config = makeConfig();
            const reload = vi.fn();
            const consent = create(config, { reload });
            consent.acceptAll();
            consent.markLoaded('marketing');

            env.doc.cookie = '__cookie_consent=; Max-Age=0; Path=/';
            env.doc.cookie = '__cookie_consent_v=; Max-Age=0; Path=/';
            tick();
            consent.sync();
            vi.runAllTimers();

            expect(consent.hasDecision()).toBe(false);
            expect(reload).toHaveBeenCalledTimes(1);
        });
    });

    describe('syncOnVisibility (S2)', () => {
        const setVisibility = (state: 'visible' | 'hidden'): void => {
            Object.defineProperty(env.doc, 'visibilityState', { value: state, configurable: true });
        };
        const pageShow = (persisted: boolean): void => {
            const event = new (env.win as unknown as { Event: typeof Event }).Event('pageshow');
            Object.defineProperty(event, 'persisted', { value: persisted });
            env.win.dispatchEvent(event);
        };

        it('re-syncs (purge + reload when loaded) when the tab becomes visible after a revoke in another tab', () => {
            const config = makeConfig();
            const reload = vi.fn();
            const consent = create(config, { reload });
            consent.acceptAll();
            consent.markLoaded('analytics');

            writeState(config, env.doc, []);
            seedCookies(env.doc, '_ga=1');
            setVisibility('visible');
            env.dispatch('visibilitychange');

            expect(consent.has('analytics')).toBe(false);
            vi.runAllTimers();
            expect(reload).toHaveBeenCalledTimes(1);
            tick();
            expect(env.names()).not.toContain('_ga');
        });

        it('ignores visibilitychange while hidden', () => {
            const config = makeConfig();
            const consent = create(config);
            consent.acceptAll();

            writeState(config, env.doc, []);
            setVisibility('hidden');
            env.dispatch('visibilitychange');

            expect(consent.has('analytics')).toBe(true);
        });

        it('re-syncs on a bfcache pageshow but not on a plain one', () => {
            const config = makeConfig();
            const consent = create(config);
            consent.acceptAll();

            writeState(config, env.doc, []);
            pageShow(false);
            expect(consent.has('analytics')).toBe(true);

            pageShow(true);
            expect(consent.has('analytics')).toBe(false);
        });

        it('does not listen when syncOnVisibility is false', () => {
            const config = makeConfig();
            const consent = create(config, { syncOnVisibility: false });
            consent.acceptAll();

            writeState(config, env.doc, []);
            setVisibility('visible');
            env.dispatch('visibilitychange');
            pageShow(true);

            expect(consent.has('analytics')).toBe(true);
        });

        it('destroy removes both listeners', () => {
            const config = makeConfig();
            const consent = create(config);
            consent.acceptAll();
            consent.destroy();

            writeState(config, env.doc, []);
            setVisibility('visible');
            env.dispatch('visibilitychange');
            pageShow(true);

            expect(consent.has('analytics')).toBe(true);
        });
    });

    describe('shadow cookies on a configured cookie.domain (M1)', () => {
        const DOMAIN = '.example.test';
        const jarCount = (name: string): number => env.doc.cookie.split(';').filter((part) => part.trim().startsWith(`${name}=`)).length;
        let config: ConsentConfig;

        beforeEach(async () => {
            await env.close();
            env = makeEnv('http://www.example.test/');
            const base = makeConfig();
            config = makeConfig({ cookie: { ...base.cookie, domain: DOMAIN } });
        });

        it('rejectAll clears a legacy host-only decision so it cannot be read first', () => {
            seedCookies(env.doc, '__cookie_consent=necessary,analytics,marketing; __cookie_consent_v=2026-10');
            const consent = create(config);
            // M1b: a host-only copy is never legitimate with a domain configured, so it is dropped at read time.
            expect(consent.hasDecision()).toBe(false);

            consent.rejectAll();
            tick();

            expect(jarCount('__cookie_consent')).toBe(1);
            expect(jarCount('__cookie_consent_v')).toBe(1);
            expect(consent.has('marketing')).toBe(false);
            expect(create(config).has('marketing')).toBe(false);
        });

        it('M1b: a legacy host-only grant on this host cannot override a rejection made on a sibling subdomain', () => {
            // www holds a legacy host-only grant; the visitor rejected on shop, which wrote Domain cookies www cannot overwrite.
            seedCookies(env.doc, '__cookie_consent=necessary,analytics,marketing');
            tick();
            env.doc.cookie = '__cookie_consent=necessary; Path=/; Domain=example.test';
            env.doc.cookie = '__cookie_consent_v=2026-10; Path=/; Domain=example.test';
            expect(jarCount('__cookie_consent')).toBe(2);

            const consent = create(config);
            tick();

            expect(consent.state()).toEqual({ decided: true, granted: ['necessary'], version: '2026-10' });
            expect(consent.has('marketing')).toBe(false);
            expect(jarCount('__cookie_consent')).toBe(1);
        });

        it('M1b: expires a host-only consent id cookie before reading it when logging with a domain', () => {
            const base = makeConfig();
            const logConfig = makeConfig({ cookie: { ...base.cookie, domain: DOMAIN }, log: { endpoint: '/consent/log', idCookieName: '__cookie_consent_id' } });
            seedCookies(env.doc, '__cookie_consent_id=legacy-id');
            tick();
            const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 204 } as Response));
            const consent = create(logConfig, { fetch: fetchMock as unknown as typeof fetch, uuid: () => 'fresh-id' });

            consent.acceptAll();
            tick();

            const body = JSON.parse(((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body as string);
            expect(body.consent_id).toBe('fresh-id');
            expect(jarCount('__cookie_consent_id')).toBe(1);
        });

        it('a stale-version host-only decision is expired entirely (no endless re-prompt after a domain change)', () => {
            seedCookies(env.doc, '__cookie_consent=necessary,analytics; __cookie_consent_v=old');
            const consent = create(config);
            expect(consent.hasDecision()).toBe(false);
            tick();

            expect(jarCount('__cookie_consent')).toBe(0);
            expect(jarCount('__cookie_consent_v')).toBe(0);

            consent.acceptAll();
            tick();

            expect(jarCount('__cookie_consent')).toBe(1);
            expect(create(config).hasDecision()).toBe(true);
        });

        it('withdraw expires host-only and Domain variants of both cookies', () => {
            seedCookies(env.doc, '__cookie_consent=necessary,marketing; __cookie_consent_v=2026-10');
            const consent = create(config);
            consent.acceptAll();
            expect(jarCount('__cookie_consent')).toBe(2);

            consent.withdraw();
            tick();

            expect(jarCount('__cookie_consent')).toBe(0);
            expect(jarCount('__cookie_consent_v')).toBe(0);
        });
    });

    describe('housekeeping purge for decided visitors (D48)', () => {
        const LEFTOVERS = '_ga=1; _ga_ABC=2; _gid=3; _gcl_au=4; keep_me=6';

        it('purges non-granted optional cookies on create after a reject, keeps others', () => {
            const config = makeConfig();
            writeState(config, env.doc, []);
            seedCookies(env.doc, LEFTOVERS);
            const reload = vi.fn();

            create(config, { reload });
            vi.runAllTimers();
            tick();

            const names = env.names();
            expect(names).not.toContain('_ga');
            expect(names).not.toContain('_ga_ABC');
            expect(names).not.toContain('_gid');
            expect(names).not.toContain('_gcl_au');
            expect(names).toContain('keep_me');
            expect(reload).not.toHaveBeenCalled();
        });

        it('purges through every parent domain (GA sets cookies on the registrable domain)', () => {
            const config = makeConfig();
            writeState(config, env.doc, []);
            const writes: string[] = [];
            seedCookies(env.doc, '_ga=1');

            create(config, { writeCookie: (_doc, cookieString) => writes.push(cookieString) });

            expect(writes).toContain('_ga=; Max-Age=0; Path=/');
            expect(writes).toContain('_ga=; Max-Age=0; Path=/; Domain=localhost');
        });

        it('leaves undecided visitors untouched (D43)', () => {
            seedCookies(env.doc, LEFTOVERS);

            create();
            tick();

            expect(env.names()).toEqual(expect.arrayContaining(['_ga', '_ga_ABC', '_gid', '_gcl_au', 'keep_me']));
        });

        it('keeps the cookies of granted categories', () => {
            const config = makeConfig();
            writeState(config, env.doc, ['analytics']);
            seedCookies(env.doc, LEFTOVERS);

            create(config);
            tick();

            const names = env.names();
            expect(names).toEqual(expect.arrayContaining(['_ga', '_ga_ABC', '_gid']));
            expect(names).not.toContain('_gcl_au');
        });

        it('sync() purges leftovers a second tab re-created, without a reload', () => {
            const config = makeConfig();
            const reload = vi.fn();
            const consent = create(config, { reload });
            consent.rejectAll();
            seedCookies(env.doc, '_ga=1');

            consent.sync();
            vi.runAllTimers();
            tick();

            expect(env.names()).not.toContain('_ga');
            expect(reload).not.toHaveBeenCalled();
        });

        it('a cross-tab revoke of a loaded category still reloads exactly once', () => {
            const config = makeConfig();
            const reload = vi.fn();
            const consent = create(config, { reload });
            consent.acceptAll();
            consent.markLoaded('analytics');

            writeState(config, env.doc, []);
            seedCookies(env.doc, '_ga=1');
            consent.sync();
            vi.runAllTimers();

            expect(reload).toHaveBeenCalledTimes(1);
        });
    });
});
