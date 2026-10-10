import { mount } from '@vue/test-utils';
import { ConsentError } from '@netipar/consent-core';
import { defineComponent } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { plugin } from './__tests__/support';
import { type UseConsent, useConsent } from './useConsent';

function harness(): { wrapper: ReturnType<typeof mount>; consent: () => UseConsent } {
    let captured: UseConsent | undefined;
    const Harness = defineComponent({
        setup() {
            captured = useConsent();

            return () => null;
        },
    });
    const wrapper = mount(Harness, { global: { plugins: [plugin()] } });

    return { wrapper, consent: () => captured as UseConsent };
}

describe('useConsent', () => {
    it('throws without the plugin', () => {
        const Harness = defineComponent({
            setup() {
                useConsent();

                return () => null;
            },
        });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        expect(() => mount(Harness)).toThrow(ConsentError);
        expect(() => mount(Harness)).toThrow('consent: install createConsentPlugin first');

        warn.mockRestore();
    });

    it('starts undecided with the prompt open and exposes config texts and categories', () => {
        const { consent } = harness();

        expect(consent().promptOpen.value).toBe(true);
        expect(consent().decided.value).toBe(false);
        expect(consent().settingsOpen.value).toBe(false);
        expect(consent().granted.value).toEqual(['necessary']);
        expect(consent().texts.title).toBe('Sütiket használunk');
        expect(consent().categories.map((category) => category.key)).toEqual(['necessary', 'analytics', 'marketing']);
    });

    it('acceptAll decides, grants every category and closes the prompt', () => {
        const { consent } = harness();

        consent().acceptAll();

        expect(consent().decided.value).toBe(true);
        expect([...consent().granted.value].sort()).toEqual(['analytics', 'marketing', 'necessary']);
        expect(consent().promptOpen.value).toBe(false);
        expect(consent().has('analytics')).toBe(true);
    });

    it('rejectAll keeps only required categories', () => {
        const { consent } = harness();

        consent().rejectAll();

        expect(consent().decided.value).toBe(true);
        expect(consent().granted.value).toEqual(['necessary']);
        expect(consent().has('analytics')).toBe(false);
    });

    it('save grants the chosen categories; withdraw reopens the prompt', () => {
        const { consent } = harness();

        consent().save(['analytics']);
        expect([...consent().granted.value].sort()).toEqual(['analytics', 'necessary']);

        consent().withdraw();
        expect(consent().decided.value).toBe(false);
        expect(consent().promptOpen.value).toBe(true);
    });

    it('tracks settingsOpen and dismissPrompt', () => {
        const { consent } = harness();

        consent().openSettings();
        expect(consent().settingsOpen.value).toBe(true);
        consent().closeSettings();
        expect(consent().settingsOpen.value).toBe(false);

        consent().dismissPrompt();
        expect(consent().promptOpen.value).toBe(false);
        expect(consent().decided.value).toBe(false);
    });

    it('releases its manager subscriptions when the component unmounts', () => {
        const { wrapper, consent } = harness();
        const detached = consent();

        wrapper.unmount();
        detached.manager.acceptAll();

        expect(detached.decided.value).toBe(false);
        expect(detached.promptOpen.value).toBe(true);
    });
});
