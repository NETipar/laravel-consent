import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeConfig, makeEnv, seedCookies, tick } from './__tests__/support';
import type { TestEnv } from './__tests__/support';
import { writeState } from './state';
import { createConsent } from './consent';
import { attachLog } from './log';
import { LOG_FAILED_EVENT } from './types';
import type { ConsentAction, ConsentConfig, CreateConsentOptions } from './types';

const logConfig = { endpoint: '/consent/log', idCookieName: '__cookie_consent_id' };

function ok(status = 204): Response {
    return new Response(null, { status });
}

describe('attachLog (S17, D26)', () => {
    let env: TestEnv;

    beforeEach(() => {
        vi.useFakeTimers();
        env = makeEnv('http://localhost:3000/');
    });

    afterEach(async () => {
        await env.close();
        vi.useRealTimers();
    });

    function setup(overrides: Partial<ConsentConfig> = {}, options: CreateConsentOptions = {}) {
        let counter = 0;
        const fetchMock = vi.fn().mockResolvedValue(ok());
        const reload = vi.fn();
        const consent = createConsent(makeConfig({ log: logConfig, ...overrides }), {
            document: env.doc,
            window: env.win,
            fetch: fetchMock as unknown as typeof fetch,
            uuid: () => `u${++counter}`,
            reload,
            ...options,
        });

        return { consent, fetchMock, reload };
    }

    function bodyOf(fetchMock: ReturnType<typeof vi.fn>, call = 0): Record<string, unknown> {
        return JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string);
    }

    function captureFailures(): Array<{ action: ConsentAction; error: unknown }> {
        const failures: Array<{ action: ConsentAction; error: unknown }> = [];

        env.doc.addEventListener(LOG_FAILED_EVENT, (event) => {
            failures.push((event as CustomEvent).detail);
        });

        return failures;
    }

    it('does nothing when config.log is null', () => {
        const { consent, fetchMock } = setup({ log: null });

        consent.acceptAll();

        expect(fetchMock).not.toHaveBeenCalled();
        expect(env.names()).not.toContain('__cookie_consent_id');
    });

    it('does nothing when options.log is false', () => {
        const { consent, fetchMock } = setup({}, { log: false });

        consent.acceptAll();

        expect(fetchMock).not.toHaveBeenCalled();
        expect(env.names()).not.toContain('__cookie_consent_id');
    });

    it('returns a no-op detacher when disabled', () => {
        const consent = createConsent(makeConfig(), { document: env.doc, window: env.win });

        expect(attachLog(consent)()).toBeUndefined();
    });

    it('POSTs acceptAll with the contract payload and headers, and writes the id cookie', () => {
        seedCookies(env.doc, 'XSRF-TOKEN=tok%3D%3Den%2Fc');
        const { consent, fetchMock } = setup();

        consent.acceptAll();

        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/consent/log');
        expect(init.method).toBe('POST');
        expect(init.keepalive).toBe(true);
        expect(init.credentials).toBe('same-origin');
        expect(init.headers).toEqual({
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-XSRF-TOKEN': 'tok==en/c',
            'X-Requested-With': 'XMLHttpRequest',
        });
        expect(JSON.parse(init.body as string)).toEqual({
            event_id: 'u2',
            consent_id: 'u1',
            action: 'accept_all',
            granted: ['necessary', 'analytics', 'marketing'],
            version: '2026-10',
            url: '/',
        });
        expect(env.doc.cookie).toContain('__cookie_consent_id=u1');
    });

    it('writes the id cookie with the consent cookie attributes', () => {
        const writes: string[] = [];
        const target = env.doc;
        const spyDoc = new Proxy(target, {
            get: (object, property) => {
                const value = Reflect.get(object, property, object);

                return typeof value === 'function' ? value.bind(object) : value;
            },
            set: (object, property, value) => {
                if (property === 'cookie') {
                    writes.push(value as string);
                }

                return Reflect.set(object, property, value, object);
            },
        });

        const base = makeConfig();
        const consent = createConsent(makeConfig({
            log: logConfig,
            cookie: { ...base.cookie, sameSite: 'Strict', lifetimeDays: 10, domain: null },
        }), {
            document: spyDoc,
            window: env.win,
            fetch: vi.fn().mockResolvedValue(ok()) as unknown as typeof fetch,
            uuid: () => 'u1',
        });
        consent.acceptAll();

        expect(writes).toContain('__cookie_consent_id=u1; Max-Age=864000; Path=/; SameSite=Strict');
    });

    it('sends the cookie token as X-XSRF-TOKEN, never as X-CSRF-TOKEN', () => {
        seedCookies(env.doc, 'XSRF-TOKEN=enc');
        const { consent, fetchMock } = setup();

        consent.acceptAll();

        const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
        expect(headers['X-XSRF-TOKEN']).toBe('enc');
        expect(headers).not.toHaveProperty('X-CSRF-TOKEN');
    });

    it('falls back to the csrf meta tag as X-CSRF-TOKEN, then to no token header', () => {
        const meta = env.doc.createElement('meta');
        meta.setAttribute('name', 'csrf-token');
        meta.setAttribute('content', 'meta-token');
        env.doc.head.appendChild(meta);

        const { consent, fetchMock } = setup();
        consent.acceptAll();
        const metaHeaders = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
        expect(metaHeaders['X-CSRF-TOKEN']).toBe('meta-token');
        expect(metaHeaders).not.toHaveProperty('X-XSRF-TOKEN');

        meta.remove();
        consent.rejectAll();
        const bareHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
        expect(bareHeaders).not.toHaveProperty('X-CSRF-TOKEN');
        expect(bareHeaders).not.toHaveProperty('X-XSRF-TOKEN');
    });

    it('reuses the consent id and issues a new event id on the next decision', () => {
        const { consent, fetchMock } = setup();

        consent.acceptAll();
        consent.save(['analytics']);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(bodyOf(fetchMock, 1)).toMatchObject({
            event_id: 'u3',
            consent_id: 'u1',
            action: 'save',
            granted: ['necessary', 'analytics'],
        });
    });

    it('reuses a consent id that already exists in the jar', () => {
        seedCookies(env.doc, '__cookie_consent_id=existing');
        const { consent, fetchMock } = setup();

        consent.acceptAll();

        expect(bodyOf(fetchMock)).toMatchObject({ consent_id: 'existing', event_id: 'u1' });
    });

    it('withdraw POSTs first, then drops the id cookie; the next decision starts a new id', () => {
        const { consent, fetchMock } = setup();

        consent.acceptAll();
        consent.withdraw();
        tick();

        expect(bodyOf(fetchMock, 1)).toMatchObject({ action: 'withdraw', consent_id: 'u1' });
        expect(env.names()).not.toContain('__cookie_consent_id');

        consent.acceptAll();
        expect(bodyOf(fetchMock, 2)).toMatchObject({ action: 'accept_all', consent_id: 'u4' });
        expect(env.doc.cookie).toContain('__cookie_consent_id=u4');
    });

    it('deletes the id cookie after issuing the fetch, not after it resolves', () => {
        let resolve!: (response: Response) => void;
        const pending = new Promise<Response>((done) => {
            resolve = done;
        });
        const { consent } = setup({}, { fetch: vi.fn().mockReturnValue(pending) as unknown as typeof fetch });

        consent.acceptAll();
        consent.withdraw();
        tick();

        expect(env.names()).not.toContain('__cookie_consent_id');
        resolve(ok());
    });

    describe('failures never throw and never block the UI', () => {
        it.each([
            ['rejection', () => Promise.reject(new TypeError('network'))],
            ['HTTP 500', () => Promise.resolve(ok(500))],
            ['HTTP 419 (CSRF)', () => Promise.resolve(ok(419))],
            ['synchronous throw', () => {
                throw new Error('boom');
            }],
        ])('%s dispatches consent:log-failed once', async (_label, behaviour) => {
            const failures = captureFailures();
            const { consent, fetchMock } = setup();
            fetchMock.mockImplementation(behaviour);

            expect(() => consent.acceptAll()).not.toThrow();
            await vi.advanceTimersByTimeAsync(0);

            expect(failures).toHaveLength(1);
            expect(failures[0].action).toBe('accept_all');
            expect(failures[0].error).toBeInstanceOf(Error);
            expect(consent.state().granted).toEqual(['necessary', 'analytics', 'marketing']);
            expect(consent.hasDecision()).toBe(true);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('does not dispatch on success', async () => {
            const failures = captureFailures();
            const { consent } = setup();

            consent.acceptAll();
            await vi.advanceTimersByTimeAsync(0);

            expect(failures).toHaveLength(0);
        });
    });

    it('emits onChange with "sync" and does not log when cookies change externally', () => {
        const config = makeConfig({ log: logConfig });
        const { consent, fetchMock } = setup();
        const onChange = vi.fn();
        consent.onChange(onChange);

        writeState(config, env.doc, ['analytics']);
        consent.sync();

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][2]).toBe('sync');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(env.names()).not.toContain('__cookie_consent_id');
    });

    it('logs before the reload-on-revoke fires', () => {
        const { consent, fetchMock, reload } = setup();

        consent.acceptAll();
        consent.markLoaded('analytics');
        fetchMock.mockClear();
        consent.rejectAll();
        vi.runOnlyPendingTimers();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]);
    });

    it('detaches', () => {
        const fetchMock = vi.fn().mockResolvedValue(ok());
        const manager = createConsent(makeConfig({ log: logConfig }), { document: env.doc, window: env.win, log: false });

        const detach = attachLog(manager, { document: env.doc, window: env.win, fetch: fetchMock as unknown as typeof fetch, uuid: () => 'x' });
        detach();
        manager.acceptAll();

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('generates v4 uuids by default (randomUUID and getRandomValues fallback)', () => {
        const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
        const fetchMock = vi.fn().mockResolvedValue(ok());
        const bodies: Array<Record<string, string>> = [];

        for (const withRandomUuid of [true, false]) {
            const cryptoApi = globalThis.crypto;
            const original = cryptoApi.randomUUID;

            if (!withRandomUuid) {
                Object.defineProperty(cryptoApi, 'randomUUID', { configurable: true, value: undefined });
            }

            try {
                const localEnv = makeEnv();
                const consent = createConsent(makeConfig({ log: logConfig }), {
                    document: localEnv.doc,
                    window: localEnv.win,
                    fetch: fetchMock as unknown as typeof fetch,
                });
                consent.acceptAll();
                bodies.push(bodyOf(fetchMock, fetchMock.mock.calls.length - 1) as Record<string, string>);
            } finally {
                Object.defineProperty(cryptoApi, 'randomUUID', { configurable: true, value: original });
            }
        }

        for (const body of bodies) {
            expect(body.event_id).toMatch(pattern);
            expect(body.consent_id).toMatch(pattern);
        }
    });

    it.each([
        ['acceptAll', (c: ReturnType<typeof setup>['consent']) => c.acceptAll(), 'accept_all'],
        ['save', (c: ReturnType<typeof setup>['consent']) => c.save(['marketing']), 'save'],
        ['rejectAll', (c: ReturnType<typeof setup>['consent']) => {
            c.acceptAll();
            c.rejectAll();
        }, 'reject_all'],
        ['withdraw', (c: ReturnType<typeof setup>['consent']) => {
            c.acceptAll();
            c.withdraw();
        }, 'withdraw'],
    ])('onChange listeners receive the action for %s', (_name, run, expected) => {
        const { consent } = setup({ log: null });
        const actions: ConsentAction[] = [];
        consent.onChange((_state, _previous, action) => actions.push(action));

        run(consent);

        expect(actions[actions.length - 1]).toBe(expected);
    });

    it('the consent:change event detail carries the action', () => {
        const { consent } = setup({ log: null });
        const details: Array<{ action: ConsentAction }> = [];
        env.doc.addEventListener('consent:change', (event) => details.push((event as CustomEvent).detail));

        consent.save([]);

        expect(details.map((detail) => detail.action)).toEqual(['save']);
    });
});
