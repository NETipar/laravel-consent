import type { App, InjectionKey, Plugin } from 'vue';
import {
    type ConsentConfig,
    ConsentError,
    type ConsentManager,
    type ConsentState,
    type CreateConsentOptions,
    createConsent,
} from '@netipar/consent-core';

export const ConsentKey: InjectionKey<ConsentManager> = Symbol('consent');

/**
 * Inert manager for Inertia SSR (no `document`, no cookies): undecided, prompt
 * open, every action a no-op. The server markup therefore always contains the
 * prompt; the client creates the real manager and `<ConsentBanner>` re-applies
 * `hidden` on mount for visitors who already decided.
 */
function createServerManager(config: ConsentConfig): ConsentManager {
    const state: ConsentState = Object.freeze({
        decided: false,
        granted: Object.freeze(config.categories.filter((category) => category.required).map((category) => category.key)),
        version: null,
    });
    const ui = { promptOpen: true, settingsOpen: false };
    const noop = (): void => {};
    const detached = (): (() => void) => noop;

    return {
        config,
        state: () => state,
        ui: () => ({ ...ui }),
        has(category: string): boolean {
            const known = config.categories.find((candidate) => candidate.key === category);

            if (!known) {
                throw new ConsentError(`consent: unknown category "${category}"`);
            }

            return known.required;
        },
        hasDecision: () => false,
        acceptAll: noop,
        rejectAll: noop,
        save: noop,
        withdraw: noop,
        openSettings: noop,
        closeSettings: noop,
        dismissPrompt: noop,
        onChange: detached,
        onUi: detached,
        sync: noop,
        markLoaded: noop,
        destroy: noop,
    };
}

/**
 * `app.use(createConsentPlugin(config, options))` creates the app-scoped
 * consent manager and provides it under `ConsentKey`. The manager is
 * destroyed when the app unmounts. Without a `document` (Inertia SSR) an inert
 * server manager is provided instead of throwing.
 */
export function createConsentPlugin(config: ConsentConfig, options: CreateConsentOptions = {}): Plugin {
    return {
        install(app: App): void {
            const server = options.document === undefined && typeof document === 'undefined';
            const manager = server ? createServerManager(config) : createConsent(config, options);

            app.provide(ConsentKey, manager);
            app.onUnmount(() => manager.destroy());
        },
    };
}
