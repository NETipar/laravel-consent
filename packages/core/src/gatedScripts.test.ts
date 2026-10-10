import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeConfig, makeEnv } from './__tests__/support';
import type { TestEnv } from './__tests__/support';
import { createConsent } from './consent';
import { activateGatedScripts } from './gatedScripts';
import type { ConsentManager } from './types';

describe('activateGatedScripts', () => {
    let env: TestEnv;

    beforeEach(() => {
        vi.useFakeTimers();
        env = makeEnv();
    });

    afterEach(async () => {
        await env.close();
        vi.useRealTimers();
    });

    function setup(html: string, gatedScripts = true): ConsentManager {
        env.doc.body.innerHTML = html;

        return createConsent(makeConfig(), { document: env.doc, window: env.win, gatedScripts });
    }

    function activated(): HTMLScriptElement[] {
        return Array.from(env.doc.querySelectorAll<HTMLScriptElement>('script:not([type="text/plain"])'));
    }

    it('activates an inline script with a nonce after acceptAll, once', () => {
        const consent = setup('<script type="text/plain" data-consent="analytics" nonce="abc">window.x = 1;</script>');
        expect(activated()).toHaveLength(0);

        consent.acceptAll();

        const original = env.doc.querySelector('script[type="text/plain"]') as HTMLScriptElement;
        const next = original.nextElementSibling as HTMLScriptElement;
        expect(next.tagName).toBe('SCRIPT');
        expect(next.getAttribute('type')).toBe('text/javascript');
        expect(next.textContent).toBe('window.x = 1;');
        expect(next.getAttribute('nonce')).toBe('abc');
        expect(original.getAttribute('data-consent-activated')).toBe('true');
        expect(activateGatedScripts(consent, env.doc)).toBe(0);
        expect(activated()).toHaveLength(1);
    });

    it('copies a nonce that the browser hides from getAttribute()', () => {
        const consent = setup('<script type="text/plain" data-consent="analytics" nonce=""></script>', false);
        const original = env.doc.querySelector('script[type="text/plain"]') as HTMLScriptElement;
        original.nonce = 'hidden-nonce';
        original.setAttribute('nonce', '');
        consent.acceptAll();

        activateGatedScripts(consent, env.doc);

        const next = activated()[0];
        expect(next.nonce).toBe('hidden-nonce');
        expect(next.getAttribute('nonce')).toBe('hidden-nonce');
    });

    it('does not activate while the category is not granted', () => {
        const consent = setup('<script type="text/plain" data-consent="analytics">1;</script>');

        consent.rejectAll();

        expect(activated()).toHaveLength(0);
        expect(activateGatedScripts(consent, env.doc)).toBe(0);
    });

    it('copies src, async, defer and data attributes but not type or data-consent', () => {
        const consent = setup(
            '<script type="text/plain" data-consent="analytics" data-consent-type="text/javascript" src="/a.js" async defer data-foo="bar"></script>',
            false,
        );
        consent.acceptAll();

        expect(activateGatedScripts(consent, env.doc)).toBe(1);

        const next = activated()[0];
        expect(next.getAttribute('src')).toBe('/a.js');
        expect(next.hasAttribute('async')).toBe(true);
        expect(next.hasAttribute('defer')).toBe(true);
        expect(next.getAttribute('data-foo')).toBe('bar');
        expect(next.getAttribute('type')).toBe('text/javascript');
        expect(next.hasAttribute('data-consent')).toBe(false);
        expect(next.hasAttribute('data-consent-type')).toBe(false);
        expect(next.hasAttribute('data-consent-activated')).toBe(false);
        expect(next.textContent).toBe('');
    });

    it.each(['analytics marketing', 'analytics,marketing', 'analytics, marketing'])(
        'requires every category of "%s"',
        (value) => {
            const consent = setup(`<script type="text/plain" data-consent="${value}">1;</script>`, false);

            consent.rejectAll();
            expect(activateGatedScripts(consent, env.doc)).toBe(0);

            consent.save(['analytics']);
            expect(activateGatedScripts(consent, env.doc)).toBe(0);

            consent.acceptAll();
            expect(activateGatedScripts(consent, env.doc)).toBe(1);
        },
    );

    it('honours data-consent-type', () => {
        const consent = setup('<script type="text/plain" data-consent="analytics" data-consent-type="module">1;</script>');

        consent.acceptAll();

        expect(activated()[0].getAttribute('type')).toBe('module');
    });

    it('skips unknown categories silently', () => {
        const consent = setup('<script type="text/plain" data-consent="foo">1;</script>', false);
        consent.acceptAll();

        expect(() => activateGatedScripts(consent, env.doc)).not.toThrow();
        expect(activateGatedScripts(consent, env.doc)).toBe(0);
        expect(activated()).toHaveLength(0);
    });

    it('skips a script that mixes known and unknown categories', () => {
        const consent = setup('<script type="text/plain" data-consent="analytics foo">1;</script>', false);
        consent.acceptAll();

        expect(activateGatedScripts(consent, env.doc)).toBe(0);
    });

    it('skips an empty data-consent attribute', () => {
        const consent = setup('<script type="text/plain" data-consent="">1;</script>', false);
        consent.acceptAll();

        expect(activateGatedScripts(consent, env.doc)).toBe(0);
    });

    it('activates scripts added later on livewire:navigated', () => {
        const consent = setup('');
        consent.acceptAll();

        env.doc.body.insertAdjacentHTML('beforeend', '<script type="text/plain" data-consent="analytics">2;</script>');
        expect(activated()).toHaveLength(0);

        env.dispatch('livewire:navigated');

        expect(activated()).toHaveLength(1);
        expect(activated()[0].textContent).toBe('2;');
    });

    it('ignores a script that already carries data-consent-activated', () => {
        const consent = setup(
            '<script type="text/plain" data-consent="analytics" data-consent-activated="true">1;</script>',
            false,
        );
        consent.acceptAll();

        expect(activateGatedScripts(consent, env.doc)).toBe(0);
        expect(activated()).toHaveLength(0);
    });

    it('only scans inside the given root', () => {
        const consent = setup(
            '<div id="a"><script type="text/plain" data-consent="analytics">1;</script></div>'
            + '<div id="b"><script type="text/plain" data-consent="analytics">2;</script></div>',
            false,
        );
        consent.acceptAll();

        expect(activateGatedScripts(consent, env.doc.getElementById('b') as HTMLElement)).toBe(1);
        expect(env.doc.querySelectorAll('#a script')).toHaveLength(1);
        expect(env.doc.querySelectorAll('#b script')).toHaveLength(2);
    });

    it('marks the script categories as loaded', () => {
        const consent = setup('<script type="text/plain" data-consent="analytics marketing">1;</script>', false);
        const markLoaded = vi.spyOn(consent, 'markLoaded');
        consent.acceptAll();

        activateGatedScripts(consent, env.doc);

        expect(markLoaded.mock.calls.map(([key]) => key)).toEqual(['analytics', 'marketing']);
    });

    it('triggers reload-on-revoke after a gated script was activated (D23)', () => {
        const reload = vi.fn();
        env.doc.body.innerHTML = '<script type="text/plain" data-consent="analytics">1;</script>';
        const consent = createConsent(makeConfig(), { document: env.doc, window: env.win, reload });

        consent.acceptAll();
        consent.save([]);
        vi.advanceTimersByTime(1);

        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('keeps document order for src scripts unless the author opted into async', () => {
        const consent = setup(
            '<script type="text/plain" data-consent="analytics" src="/a.js"></script>'
            + '<script type="text/plain" data-consent="analytics" src="/b.js" async></script>',
            false,
        );
        // Real browsers default a dynamically created script to async (force-async); only an explicit property write clears it.
        const asyncWrites: boolean[] = [];
        const prototype = Object.getPrototypeOf(env.doc.createElement('script')) as object;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'async') as PropertyDescriptor;
        Object.defineProperty(prototype, 'async', {
            configurable: true,
            get: descriptor.get,
            set(this: HTMLScriptElement, value: boolean) {
                asyncWrites.push(value);
                descriptor.set?.call(this, value);
            },
        });

        consent.acceptAll();

        activateGatedScripts(consent, env.doc);
        Object.defineProperty(prototype, 'async', descriptor);

        expect(asyncWrites).toEqual([false, true]);
        const [first, second] = activated();
        expect(first.getAttribute('src')).toBe('/a.js');
        expect(first.async).toBe(false);
        expect(second.getAttribute('src')).toBe('/b.js');
        expect(second.async).toBe(true);
    });
});
