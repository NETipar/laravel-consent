// @vitest-environment node
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import { ConsentBanner } from './components/ConsentBanner';
import { useConsent } from './useConsent';
import { createConsentPlugin } from './plugin';
import { makeConfig, quietOptions } from './__tests__/support';

describe('Inertia SSR (no document)', () => {
    it('runs in a node environment', () => {
        expect(typeof document).toBe('undefined');
    });

    it('renders the prompt markup with the inert server manager instead of throwing', async () => {
        const app = createSSRApp({ render: () => h(ConsentBanner) });
        app.use(createConsentPlugin(makeConfig(), quietOptions));

        const html = await renderToString(app);

        expect(html).toContain('Sütiket használunk');
        expect(html).toContain('role="dialog"');
        expect(html).not.toMatch(/<section[^>]*\shidden/);
    });

    it('useConsent exposes an undecided, inert manager', async () => {
        let captured: ReturnType<typeof useConsent> | undefined;
        const app = createSSRApp({
            setup() {
                captured = useConsent();

                return () => h('div');
            },
        });
        app.use(createConsentPlugin(makeConfig(), quietOptions));
        await renderToString(app);

        expect(captured?.decided.value).toBe(false);
        expect(captured?.promptOpen.value).toBe(true);
        expect(captured?.granted.value).toEqual(['necessary']);
        expect(captured?.has('necessary')).toBe(true);
        expect(captured?.has('analytics')).toBe(false);
        expect(() => captured?.has('nope')).toThrow('unknown category');

        captured?.acceptAll();
        captured?.openSettings();

        expect(captured?.decided.value).toBe(false);
        expect(captured?.manager.hasDecision()).toBe(false);
    });
});
