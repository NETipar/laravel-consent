import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeConfig, makeEnv } from './__tests__/support';
import type { TestEnv } from './__tests__/support';
import { createConsent } from './consent';
import { activateGatedScripts } from './gatedScripts';
import { attachGoogle } from './google';
import { attachLog } from './log';
import { writeState } from './state';

vi.mock('./gatedScripts', () => ({ activateGatedScripts: vi.fn(() => 0) }));
vi.mock('./google', () => ({ attachGoogle: vi.fn(() => vi.fn()) }));
vi.mock('./log', () => ({ attachLog: vi.fn(() => vi.fn()) }));

const google = { tags: [{ id: 'G-TEST', category: 'analytics' }], signals: {
    analytics_storage: 'analytics',
    ad_storage: 'marketing',
    ad_user_data: 'marketing',
    ad_personalization: 'marketing',
}, adsDataRedaction: false, urlPassthrough: false };

describe('createConsent hook wiring (S5 / S6 / S17)', () => {
    let env: TestEnv;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        env = makeEnv();
    });

    afterEach(async () => {
        await env.close();
        vi.useRealTimers();
    });

    it('activates gated scripts on create, after every transition and on sync(root)', () => {
        const config = makeConfig();
        const consent = createConsent(config, { document: env.doc, window: env.win });
        expect(activateGatedScripts).toHaveBeenLastCalledWith(consent, env.doc);

        consent.acceptAll();
        expect(activateGatedScripts).toHaveBeenCalledTimes(2);

        const root = env.doc.createElement('div');
        consent.sync(root);
        expect(activateGatedScripts).toHaveBeenLastCalledWith(consent, root);

        writeState(config, env.doc, []);
        env.dispatch('livewire:navigated');
        expect(activateGatedScripts).toHaveBeenCalledTimes(4);
        expect(activateGatedScripts).toHaveBeenLastCalledWith(consent, env.doc);
    });

    it('activates gated scripts after the change notification', () => {
        const consent = createConsent(makeConfig(), { document: env.doc, window: env.win });
        const onChange = vi.fn();
        consent.onChange(onChange);

        consent.acceptAll();

        const order = vi.mocked(activateGatedScripts).mock.invocationCallOrder;
        const gated = order[order.length - 1];
        expect(onChange.mock.invocationCallOrder[0]).toBeLessThan(gated);
    });

    it('skips gated scripts when disabled', () => {
        const consent = createConsent(makeConfig(), { document: env.doc, window: env.win, gatedScripts: false });
        consent.acceptAll();
        consent.sync();

        expect(activateGatedScripts).not.toHaveBeenCalled();
    });

    it('attaches Google before the log and detaches both on destroy', () => {
        const config = makeConfig({ google, log: { endpoint: '/consent/log', idCookieName: '__cookie_consent_id' } });
        const options = { document: env.doc, window: env.win };

        const consent = createConsent(config, options);

        expect(attachGoogle).toHaveBeenCalledWith(consent, env.win);
        expect(attachLog).toHaveBeenCalledWith(consent, options);
        expect(vi.mocked(attachGoogle).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(attachLog).mock.invocationCallOrder[0]);

        consent.destroy();

        expect(vi.mocked(attachGoogle).mock.results[0].value).toHaveBeenCalledTimes(1);
        expect(vi.mocked(attachLog).mock.results[0].value).toHaveBeenCalledTimes(1);
    });

    it('does not attach Google or the log when the config disables them', () => {
        createConsent(makeConfig(), { document: env.doc, window: env.win });

        expect(attachGoogle).not.toHaveBeenCalled();
        expect(attachLog).not.toHaveBeenCalled();
    });

    it('does not attach Google or the log when the options disable them', () => {
        const config = makeConfig({ google, log: { endpoint: '/consent/log', idCookieName: '__cookie_consent_id' } });

        createConsent(config, { document: env.doc, window: env.win, google: false, log: false });

        expect(attachGoogle).not.toHaveBeenCalled();
        expect(attachLog).not.toHaveBeenCalled();
    });
});
