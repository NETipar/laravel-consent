import { ConsentError } from './types';
import type { ConsentConfig } from './types';

/**
 * Parse the `<script type="application/json" id="consent-config">` emitted by
 * the `@consentConfig` Blade directive. Throws `ConsentError` when the element
 * is missing or its JSON is not a consent config.
 */
export function readConsentConfig(doc: Document = document, id = 'consent-config'): ConsentConfig {
    const error = new ConsentError(`consent: #${id} script missing or invalid`);
    const element = doc.getElementById(id);

    if (element === null) {
        throw error;
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(element.textContent ?? '');
    } catch {
        throw error;
    }

    if (typeof parsed !== 'object' || parsed === null) {
        throw error;
    }

    const candidate = parsed as Partial<ConsentConfig>;

    if (typeof candidate.version !== 'string' || candidate.version === '' || !Array.isArray(candidate.categories)) {
        throw error;
    }

    return candidate as ConsentConfig;
}
