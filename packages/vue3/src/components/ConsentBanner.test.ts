import { mount, type VueWrapper } from '@vue/test-utils';
import { createSSRApp, defineComponent, h, nextTick } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConsent } from '@netipar/consent-core';
import { makeConfig, plugin, quietOptions } from '../__tests__/support';
import { ConsentKey } from '../plugin';
import { useConsent } from '../useConsent';
import { ConsentBanner } from './ConsentBanner';

const wrappers: VueWrapper[] = [];

function mountBanner(options: Parameters<typeof mount>[1] = {}, config = makeConfig()): VueWrapper {
    const wrapper = mount(ConsentBanner, {
        attachTo: document.body,
        ...options,
        global: { plugins: [plugin(config)] },
    }) as VueWrapper;

    wrappers.push(wrapper);

    return wrapper;
}

function stubDialog(): { showModal: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } {
    const showModal = vi.fn(function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
    });
    const close = vi.fn(function (this: HTMLDialogElement) {
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
    });

    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(showModal);
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(close);

    return { showModal, close };
}

afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('ConsentBanner fallback render', () => {
    it('renders only server-resolved strings (D14) and no English literals', () => {
        const wrapper = mountBanner();
        const text = wrapper.text();

        expect(wrapper.find('#consent-title').text()).toBe('Sütiket használunk');
        expect(wrapper.find('label[for="consent-category-analytics"]').text()).toBe('Analitika');
        expect(wrapper.find('a').text()).toBe('Süti tájékoztató');
        expect(wrapper.find('a').attributes('href')).toBe('/sutik');
        expect(text).not.toContain('Cookies');
        expect(text).not.toContain('Accept');
        expect(text).not.toContain('Reject');
        expect(wrapper.findAll('button').map((button) => button.text())).toEqual([
            'Mindet elfogadom',
            'Mindet elutasítom',
            'Beállítások',
            'Mentés',
            'Mégse',
        ]);
    });

    it('omits the policy link when there is no policy url', () => {
        const wrapper = mountBanner({}, makeConfig({ policyUrl: null }));

        expect(wrapper.find('a').exists()).toBe(false);
    });

    it('mirrors the a11y contract of the Blade view', () => {
        const wrapper = mountBanner();
        const section = wrapper.get('section');

        expect(section.attributes()).toMatchObject({
            role: 'dialog',
            'aria-modal': 'false',
            'aria-labelledby': 'consent-title',
            'aria-describedby': 'consent-description',
            tabindex: '-1',
        });
        expect(section.attributes('hidden')).toBeUndefined();
        expect(wrapper.get('dialog').attributes('aria-labelledby')).toBe('consent-settings-title');
        expect(wrapper.find('#consent-settings-title').exists()).toBe(true);
        expect(wrapper.find('#consent-description').exists()).toBe(true);
        expect(wrapper.find('[data-consent-root]').exists()).toBe(true);
        wrapper.findAll('button').forEach((button) => expect(button.attributes('type')).toBe('button'));
    });

    it('hides the prompt after rejectAll', async () => {
        const wrapper = mountBanner();

        await wrapper.findAll('button')[1].trigger('click');

        expect(wrapper.get('section').attributes('hidden')).toBeDefined();
        expect(document.cookie).toContain('necessary');
    });

    it('renders required categories checked + disabled and optional ones unchecked', () => {
        const wrapper = mountBanner();
        const necessary = wrapper.get<HTMLInputElement>('#consent-category-necessary');
        const analytics = wrapper.get<HTMLInputElement>('#consent-category-analytics');

        expect(necessary.element.checked).toBe(true);
        expect(necessary.element.disabled).toBe(true);
        expect(analytics.element.checked).toBe(false);
        expect(analytics.element.disabled).toBe(false);
    });

    it('saves the checked selection from the native checkboxes', async () => {
        const wrapper = mountBanner();

        await wrapper.get('#consent-category-analytics').setValue(true);
        await wrapper.findAll('button')[3].trigger('click');

        expect(document.cookie).toContain('necessary%2Canalytics');
        expect(wrapper.get('section').attributes('hidden')).toBeDefined();
    });

    it('accept all writes every category', async () => {
        const wrapper = mountBanner();

        await wrapper.findAll('button')[0].trigger('click');

        expect(document.cookie).toContain('necessary%2Canalytics%2Cmarketing');
    });

    it('opens the settings dialog with showModal and closes it on cancel without saving', async () => {
        const { showModal, close } = stubDialog();
        const wrapper = mountBanner();
        const opener = wrapper.findAll('button')[2];

        (opener.element as HTMLButtonElement).focus();
        await opener.trigger('click');

        expect(showModal).toHaveBeenCalledTimes(1);

        await wrapper.get('#consent-category-analytics').setValue(true);
        await wrapper.findAll('button')[4].trigger('click');

        expect(close).toHaveBeenCalled();
        expect(document.activeElement).toBe(opener.element);
        expect(wrapper.get<HTMLInputElement>('#consent-category-analytics').element.checked).toBe(false);
        expect(wrapper.get('section').attributes('hidden')).toBeUndefined();
    });

    describe('opener and focus return (F21 / F22)', () => {
        const hook = (): HTMLButtonElement => {
            const footer = document.createElement('button');
            footer.setAttribute('data-consent-focus-return', '');
            document.body.appendChild(footer);

            return footer;
        };

        it('returns focus to the explicit opener when the click did not focus it (Safari)', async () => {
            stubDialog();
            const wrapper = mountBanner();
            const opener = wrapper.findAll('button')[2];
            (document.activeElement as HTMLElement).blur();

            await opener.trigger('click');
            await wrapper.findAll('button')[4].trigger('click');

            expect(document.activeElement).toBe(opener.element);
        });

        it('returns focus to [data-consent-focus-return] when saving hid the prompt that held the opener', async () => {
            stubDialog();
            const footer = hook();
            const wrapper = mountBanner();

            await wrapper.findAll('button')[2].trigger('click');
            await wrapper.findAll('button')[3].trigger('click');
            await nextTick();

            expect(wrapper.get('section').attributes('hidden')).toBeDefined();
            expect(document.activeElement).toBe(footer);
        });

        it('returns focus to the hook when the opener was removed, and leaves focus alone without a hook', async () => {
            stubDialog();
            let captured: Record<string, any> = {};
            const Host = defineComponent({
                setup() {
                    return () => h(ConsentBanner, null, { default: (props: Record<string, any>) => { captured = props; return h('p'); } });
                },
            });
            const wrapper = mount(Host, { attachTo: document.body, global: { plugins: [plugin()] } });
            wrappers.push(wrapper as VueWrapper);
            const opener = document.createElement('button');
            document.body.appendChild(opener);
            const bystander = document.createElement('input');
            document.body.appendChild(bystander);

            captured.openSettings(opener);
            opener.remove();
            bystander.focus();
            captured.closeSettings();
            expect(document.activeElement).toBe(bystander);

            const footer = hook();
            const second = document.createElement('button');
            document.body.appendChild(second);
            captured.openSettings(second);
            second.remove();
            captured.closeSettings();
            expect(document.activeElement).toBe(footer);
        });

        it('accepts the click event as opener (bare @click="openSettings")', async () => {
            stubDialog();
            let captured: Record<string, any> = {};
            const Host = defineComponent({
                setup() {
                    return () => h(ConsentBanner, null, { default: (props: Record<string, any>) => {
                        captured = props;

                        return h('button', { id: 'bare', type: 'button', onClick: props.openSettings }, 'x');
                    } });
                },
            });
            const wrapper = mount(Host, { attachTo: document.body, global: { plugins: [plugin()] } });
            wrappers.push(wrapper as VueWrapper);
            (document.activeElement as HTMLElement).blur();

            await wrapper.get('#bare').trigger('click');
            captured.closeSettings();

            expect(document.activeElement).toBe(wrapper.get('#bare').element);
        });

        it('useConsent().openSettings(el) from outside the banner hands the opener over', async () => {
            stubDialog();
            let outside: ReturnType<typeof useConsent> | undefined;
            const Footer = defineComponent({
                setup() {
                    outside = useConsent();

                    return () => h('button', { id: 'footer-open', type: 'button' }, 'x');
                },
            });
            const Host = defineComponent({ render: () => h('div', [h(ConsentBanner), h(Footer)]) });
            const wrapper = mount(Host, { attachTo: document.body, global: { plugins: [plugin()] } });
            wrappers.push(wrapper as VueWrapper);
            const footerButton = wrapper.get('#footer-open').element as HTMLElement;
            (document.activeElement as HTMLElement).blur();

            outside?.openSettings(footerButton);
            await nextTick();
            await wrapper.get('dialog').trigger('close');

            expect(document.activeElement).toBe(footerButton);
        });

        it('re-applies hidden on mount when hydrating server markup of an undecided visitor (decided on the client)', async () => {
            const undecided = createConsent(makeConfig(), quietOptions);
            const html = await renderToString(createSSRApp({ render: () => h(ConsentBanner) }).provide(ConsentKey, undecided));
            expect(html).not.toMatch(/<section[^>]*\shidden/);
            undecided.destroy();

            const decided = createConsent(makeConfig(), quietOptions);
            decided.acceptAll();
            const container = document.createElement('div');
            container.innerHTML = html;
            document.body.appendChild(container);
            vi.spyOn(console, 'warn').mockImplementation(() => {});

            const app = createSSRApp({ render: () => h(ConsentBanner) }).provide(ConsentKey, decided);
            app.mount(container);

            expect((container.querySelector('section') as HTMLElement).hidden).toBe(true);
            app.unmount();
            decided.destroy();
        });
    });

    it('treats a native dialog close (Escape) like cancel', async () => {
        stubDialog();
        const wrapper = mountBanner();

        await wrapper.findAll('button')[2].trigger('click');
        await wrapper.get('dialog').trigger('close');

        expect(wrapper.get('section').attributes('hidden')).toBeUndefined();
    });

    it('focuses the prompt once per page lifetime', () => {
        const manager = createConsent(makeConfig(), quietOptions);
        const provide = { [ConsentKey as symbol]: manager };

        const first = mount(ConsentBanner, { attachTo: document.body, global: { provide } });
        wrappers.push(first as VueWrapper);
        expect(document.activeElement).toBe(first.get('section').element);

        (document.activeElement as HTMLElement).blur();

        const second = mount(ConsentBanner, { attachTo: document.body, global: { provide } });
        wrappers.push(second as VueWrapper);
        expect(document.activeElement).not.toBe(second.get('section').element);

        manager.destroy();
    });

    it('does not focus the prompt when a decision already exists, and starts with the stored selection', () => {
        const config = makeConfig();
        const manager = createConsent(config, quietOptions);

        manager.save(['analytics']);

        const wrapper = mount(ConsentBanner, {
            attachTo: document.body,
            global: { provide: { [ConsentKey as symbol]: manager } },
        });
        wrappers.push(wrapper as VueWrapper);

        expect(wrapper.get('section').attributes('hidden')).toBeDefined();
        expect(document.activeElement).not.toBe(wrapper.get('section').element);
        expect(wrapper.get<HTMLInputElement>('#consent-category-analytics').element.checked).toBe(true);
        expect(wrapper.get<HTMLInputElement>('#consent-category-marketing').element.checked).toBe(false);

        manager.destroy();
    });
});

describe('ConsentBanner scoped slot', () => {
    it('hands selection, toggle and saveSelection to the slot', async () => {
        let captured: Record<string, any> = {};
        const Host = defineComponent({
            setup() {
                return () => h(ConsentBanner, null, {
                    default: (props: Record<string, any>) => {
                        captured = props;

                        return h('p', { id: 'custom' }, props.texts.title);
                    },
                });
            },
        });
        const wrapper = mount(Host, { global: { plugins: [plugin()] } });

        expect(wrapper.get('#custom').text()).toBe('Sütiket használunk');
        expect(wrapper.find('section').exists()).toBe(false);
        expect(captured.selection).toEqual({ necessary: true, analytics: false, marketing: false });

        captured.toggle('necessary');
        captured.toggle('analytics');
        expect(captured.selection.necessary).toBe(true);
        expect(captured.selection.analytics).toBe(true);

        captured.saveSelection();

        expect(document.cookie).toContain('necessary%2Canalytics');
        expect(captured.decided.value).toBe(true);
        expect(captured.promptRef).toBeDefined();
        expect(captured.dialogRef).toBeDefined();
    });
});
