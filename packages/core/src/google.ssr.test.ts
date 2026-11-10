// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { makeConfig } from './__tests__/support';
import { createConsent } from './consent';
import { attachGoogle } from './google';
import type { ConsentManager } from './types';

describe('attachGoogle on the server (SSR, no document)', () => {
    const google = {
        tags: [{ id: 'G-TEST', category: 'analytics' }],
        containers: [{ id: 'GTM-TEST', categories: ['analytics'] }],
        signals: { analytics_storage: 'analytics', ad_storage: 'marketing', ad_user_data: 'marketing', ad_personalization: 'marketing' },
        adsDataRedaction: false,
        urlPassthrough: false,
        updateEvent: 'consent_update',
    };

    it('runs in a node environment', () => {
        expect(typeof window).toBe('undefined');
        expect(typeof document).toBe('undefined');
    });

    it('does nothing without a window: no listener, no dataLayer, no throw', () => {
        const manager = {
            config: makeConfig({ google }),
            onChange: vi.fn(),
            has: vi.fn(() => true),
            markLoaded: vi.fn(),
            state: vi.fn(),
        };

        const detach = attachGoogle(manager as unknown as ConsentManager);

        expect(manager.onChange).not.toHaveBeenCalled();
        expect(manager.has).not.toHaveBeenCalled();
        expect(manager.markLoaded).not.toHaveBeenCalled();
        expect((globalThis as { dataLayer?: unknown }).dataLayer).toBeUndefined();
        expect(() => detach()).not.toThrow();
    });

    it('createConsent refuses to run without a document instead of touching globals', () => {
        expect(() => createConsent(makeConfig({ google }))).toThrow('consent: no document available');
        expect((globalThis as { dataLayer?: unknown }).dataLayer).toBeUndefined();
    });
});
