import { defineComponent, h, onMounted, reactive, ref, watch, type VNode } from 'vue';
import type { ConsentManager } from '@netipar/consent-core';
import { type OpenerArgument, pendingOpeners, toElement } from '../opener';
import { useConsent } from '../useConsent';

/** Managers whose prompt already took focus: focus moves once per page lifetime (PLAN §3.8). */
const focusedPrompts = new WeakSet<ConsentManager>();

/**
 * Renderless consent banner. The default scoped slot receives everything
 * `useConsent()` returns plus `selection`, `toggle`, `saveSelection`,
 * `openSettings`, `closeSettings` and the `promptRef` / `dialogRef` template
 * refs. Without a slot it renders an unstyled `<section role="dialog">` and a
 * native `<dialog>` — same a11y contract as the Blade view. Every visible
 * string comes from the server-resolved `config.texts` / category labels (D14).
 */
export const ConsentBanner = defineComponent({
    name: 'ConsentBanner',
    setup(_, { slots }) {
        const consent = useConsent();
        const { manager, texts, categories } = consent;

        const selection = reactive<Record<string, boolean>>({});
        const prompt = ref<HTMLElement | null>(null);
        const dialog = ref<HTMLDialogElement | null>(null);
        let lastTrigger: HTMLElement | null = null;

        const reset = (): void => {
            categories.forEach((category) => {
                selection[category.key] = category.required || consent.has(category.key);
            });
        };

        const toggle = (key: string): void => {
            const category = categories.find((candidate) => candidate.key === key);

            if (category && !category.required) {
                selection[key] = !selection[key];
            }
        };

        const saveSelection = (): void => {
            consent.save(Object.keys(selection).filter((key) => selection[key]));
        };

        const activeElement = (): HTMLElement | null =>
            typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

        const openSettings = (opener?: OpenerArgument): void => {
            lastTrigger = toElement(opener) ?? activeElement();
            reset();
            consent.openSettings();
        };

        /**
         * Where focus goes when the dialog closes: the opener while it is still
         * on screen; otherwise (it sat in the prompt that the decision just hid,
         * was removed, or was never focusable — Safari) the documented
         * `[data-consent-focus-return]` element; otherwise nowhere.
         */
        const focusReturnTarget = (opener: HTMLElement | null): HTMLElement | null => {
            const usable = opener !== null
                && opener.isConnected
                && opener !== document.body
                && opener !== document.documentElement
                && opener.closest('[hidden]') === null
                && !(prompt.value?.contains(opener) === true && !consent.promptOpen.value);

            return usable ? opener : document.querySelector<HTMLElement>('[data-consent-focus-return]');
        };

        const closeSettings = (): void => {
            consent.closeSettings();
            reset();

            if (typeof document !== 'undefined') {
                focusReturnTarget(lastTrigger)?.focus?.();
            }

            lastTrigger = null;
        };

        const syncDialog = (open: boolean): void => {
            const element = dialog.value;

            if (!element) {
                return;
            }

            if (open && !element.open) {
                // Reopen controls outside the banner (`useConsent().openSettings()`) never ran our openSettings().
                lastTrigger ??= pendingOpeners.get(manager) ?? activeElement();
                pendingOpeners.delete(manager);
                element.showModal();
            } else if (!open && element.open) {
                element.close();
            }
        };

        const focusPromptOnce = (): void => {
            if (consent.promptOpen.value && !focusedPrompts.has(manager)) {
                focusedPrompts.add(manager);
                prompt.value?.focus();
            }
        };

        reset();
        watch(consent.granted, reset);
        watch(consent.settingsOpen, syncDialog);
        watch(consent.promptOpen, focusPromptOnce, { flush: 'post' });

        onMounted(() => {
            // Repairs a hydration mismatch: the server rendered the prompt for an undecided visitor (inert SSR manager).
            if (prompt.value) {
                prompt.value.hidden = !consent.promptOpen.value;
            }

            focusPromptOnce();
            syncDialog(consent.settingsOpen.value);
        });

        const button = (label: string, onClick: () => void): VNode => h('button', { type: 'button', onClick }, label);

        const fallback = (): VNode => h('div', { 'data-consent-root': '' }, [
            h(
                'section',
                {
                    ref: prompt,
                    role: 'dialog',
                    'aria-modal': 'false',
                    'aria-labelledby': 'consent-title',
                    'aria-describedby': 'consent-description',
                    tabindex: '-1',
                    hidden: !consent.promptOpen.value,
                },
                [
                    h('h2', { id: 'consent-title' }, texts.title),
                    h('p', { id: 'consent-description' }, [
                        texts.description,
                        ' ',
                        manager.config.policyUrl ? h('a', { href: manager.config.policyUrl }, texts.policy) : null,
                    ]),
                    h('div', { 'data-consent-actions': '' }, [
                        button(texts.acceptAll, consent.acceptAll),
                        button(texts.rejectAll, consent.rejectAll),
                        button(texts.settings, openSettings),
                    ]),
                ],
            ),
            h(
                'dialog',
                { ref: dialog, 'aria-labelledby': 'consent-settings-title', onClose: closeSettings },
                [
                    h('h2', { id: 'consent-settings-title' }, texts.settingsTitle),
                    h('p', texts.settingsIntro),
                    h('ul', categories.map((category) => h('li', { key: category.key }, [
                        h('input', {
                            type: 'checkbox',
                            id: `consent-category-${category.key}`,
                            checked: selection[category.key] === true,
                            disabled: category.required,
                            onChange: () => toggle(category.key),
                        }),
                        h('label', { for: `consent-category-${category.key}` }, category.label),
                        h('p', category.description),
                    ]))),
                    h('div', { 'data-consent-actions': '' }, [
                        button(texts.save, saveSelection),
                        button(texts.cancel, closeSettings),
                    ]),
                ],
            ),
        ]);

        return () => slots.default
            ? slots.default({
                ...consent,
                selection,
                toggle,
                saveSelection,
                openSettings,
                closeSettings,
                promptRef: prompt,
                dialogRef: dialog,
            })
            : fallback();
    },
});
