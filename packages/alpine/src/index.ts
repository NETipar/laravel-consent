import { createConsent } from '@netipar/consent-core';
import type {
    ConsentCategory,
    ConsentConfig,
    ConsentManager,
    ConsentState,
    ConsentTexts,
    CreateConsentOptions,
} from '@netipar/consent-core';

/**
 * The minimal slice of the Alpine global this package needs — typed so we don't
 * depend on alpinejs at build time (the consumer passes their own instance).
 */
export interface AlpineLike {
    data(name: string, factory: (...args: never[]) => object): void;
    store(name: string, value: object): void;
    store(name: string): unknown;
}

/** `Alpine.store('consent')` — a reactive mirror of the core manager (PLAN §3.6). */
export interface ConsentStore {
    granted: string[];
    decided: boolean;
    promptOpen: boolean;
    settingsOpen: boolean;
    texts: ConsentTexts;
    categories: ConsentCategory[];
    has(category: string): boolean;
    acceptAll(): void;
    rejectAll(): void;
    save(categories: readonly string[]): void;
    withdraw(): void;
    /** `opener`: the control that opened the dialog (`$el`) — focus returns to it; Safari does not focus clicked buttons. */
    openSettings(opener?: OpenerArgument): void;
    closeSettings(): void;
    dismissPrompt(): void;
}

/** An element, or the DOM event of a bare `x-on:click="openSettings"` (its `currentTarget` is used). */
export type OpenerArgument = HTMLElement | Event | null;

/** The magic properties Alpine injects into every `x-data` component. */
export interface AlpineMagics {
    $refs: Record<string, HTMLElement | undefined>;
    $watch<T = unknown>(property: string, callback: (value: T) => void): void;
}

/** `x-data="consentBanner"` — the members the Blade view and custom markup bind to. */
export interface ConsentBannerComponent {
    selection: Record<string, boolean>;
    lastTrigger: HTMLElement | null;
    readonly open: boolean;
    readonly settingsOpen: boolean;
    init(): void;
    isRequired(key: string): boolean;
    resetSelection(): void;
    toggle(key: string): void;
    acceptAll(): void;
    rejectAll(): void;
    save(): void;
    openSettings(opener?: OpenerArgument): void;
    closeSettings(): void;
    showDialog(): void;
    hideDialog(): void;
}

function toElement(opener: OpenerArgument | undefined): HTMLElement | null {
    if (opener === undefined || opener === null) {
        return null;
    }

    return 'currentTarget' in opener ? (opener.currentTarget as HTMLElement | null) : opener;
}

/** The prompt takes focus the first time it opens per page lifetime — never again on Livewire navigations. */
let promptFocused = false;

/**
 * Registers `Alpine.store('consent')` and `Alpine.data('consentBanner')` on top
 * of a core manager created from `config`.
 */
export function registerConsent(Alpine: AlpineLike, config: ConsentConfig, options?: CreateConsentOptions): ConsentManager {
    const manager = createConsent(config, options);
    const doc = options?.document ?? document;
    const initial = manager.state();
    const ui = manager.ui();

    /**
     * Opener handed to `$store.consent.openSettings($el)` by a control outside the component.
     * Kept in a closure, not on the store: Alpine wraps store values in a reactive proxy.
     */
    let requestedOpener: HTMLElement | null = null;

    const initialStore: ConsentStore = {
        granted: [...initial.granted],
        decided: initial.decided,
        promptOpen: ui.promptOpen,
        settingsOpen: ui.settingsOpen,
        texts: manager.config.texts,
        categories: manager.config.categories,
        has: (category) => manager.has(category),
        acceptAll: () => manager.acceptAll(),
        rejectAll: () => manager.rejectAll(),
        save: (categories) => manager.save(categories),
        withdraw: () => manager.withdraw(),
        openSettings: (opener) => {
            requestedOpener = toElement(opener);
            manager.openSettings();
        },
        closeSettings: () => manager.closeSettings(),
        dismissPrompt: () => manager.dismissPrompt(),
    };

    Alpine.store('consent', initialStore);

    /**
     * `Alpine.store(name, obj)` wraps `obj` in a reactive proxy; only access
     * through the proxy triggers bindings and watchers. Every read and write
     * therefore goes through here, never through the literal above.
     */
    const store = (): ConsentStore => Alpine.store('consent') as ConsentStore;

    manager.onChange((state: ConsentState) => {
        store().granted = [...state.granted];
        store().decided = state.decided;
    });

    manager.onUi((next) => {
        store().promptOpen = next.promptOpen;
        store().settingsOpen = next.settingsOpen;
    });

    const focusPromptOnce = (prompt: HTMLElement | undefined): void => {
        if (!promptFocused && store().promptOpen && prompt) {
            prompt.focus();
            promptFocused = true;
        }
    };

    /**
     * Where focus goes when the dialog closes. The opener when it is still on
     * screen; otherwise (it sat in the prompt that the decision just hid, was
     * removed, or was never focusable — Safari) the documented
     * `[data-consent-focus-return]` element; otherwise nowhere.
     */
    const focusReturnTarget = (opener: HTMLElement | null, prompt: HTMLElement | undefined): HTMLElement | null => {
        const usable = opener !== null
            && opener.isConnected
            && opener !== doc.body
            && opener !== doc.documentElement
            && opener.closest('[hidden]') === null
            && !(prompt?.contains(opener) === true && !store().promptOpen);

        return usable ? opener : doc.querySelector<HTMLElement>('[data-consent-focus-return]');
    };

    // A fresh literal per component instance: getters must stay live, so no spreading/cloning.
    const makeBanner = (): ConsentBannerComponent & ThisType<ConsentBannerComponent & AlpineMagics> => ({
        selection: {},
        lastTrigger: null,

        get open(): boolean {
            return store().promptOpen;
        },

        get settingsOpen(): boolean {
            return store().settingsOpen;
        },

        init(): void {
            this.resetSelection();
            this.$watch<boolean>('settingsOpen', (open) => (open ? this.showDialog() : this.hideDialog()));
            focusPromptOnce(this.$refs.prompt);
        },

        isRequired(key: string): boolean {
            return manager.config.categories.some((category) => category.key === key && category.required);
        },

        resetSelection(): void {
            for (const category of manager.config.categories) {
                this.selection[category.key] = category.required || manager.has(category.key);
            }
        },

        toggle(key: string): void {
            if (!this.isRequired(key)) {
                this.selection[key] = !this.selection[key];
            }
        },

        acceptAll(): void {
            store().acceptAll();
        },

        rejectAll(): void {
            store().rejectAll();
        },

        save(): void {
            store().save(Object.keys(this.selection).filter((key) => this.selection[key]));
        },

        openSettings(opener?: OpenerArgument): void {
            this.lastTrigger = toElement(opener) ?? (doc.activeElement as HTMLElement | null);
            this.resetSelection();
            store().openSettings();
        },

        /** Idempotent: the dialog's native `close` event fires after the component closed it itself. */
        closeSettings(): void {
            store().closeSettings();
        },

        showDialog(): void {
            const dialog = this.$refs.settings as HTMLDialogElement | undefined;

            if (dialog && !dialog.open) {
                // Reopen controls outside the component (`$store.consent.openSettings()`) never ran our openSettings().
                this.lastTrigger ??= requestedOpener ?? (doc.activeElement as HTMLElement | null);
                requestedOpener = null;
                this.resetSelection();
                dialog.showModal();
            }
        },

        hideDialog(): void {
            const dialog = this.$refs.settings as HTMLDialogElement | undefined;

            if (dialog?.open) {
                dialog.close();
            }

            this.resetSelection();
            focusReturnTarget(this.lastTrigger, this.$refs.prompt)?.focus();
            this.lastTrigger = null;
            requestedOpener = null;
        },
    });

    Alpine.data('consentBanner', makeBanner);

    return manager;
}

export default registerConsent;

export { readConsentConfig } from '@netipar/consent-core';
export type { ConsentConfig, ConsentManager, ConsentState } from '@netipar/consent-core';
