import { afterEach, describe, expect, it } from 'vitest';
import { makeConfig, makeEnv } from './__tests__/support';
import type { TestEnv } from './__tests__/support';
import { readConsentConfig } from './config';
import { ConsentError } from './types';

describe('readConsentConfig', () => {
    let env: TestEnv;

    afterEach(async () => {
        await env.close();
    });

    it('parses the @consentConfig JSON script', () => {
        env = makeEnv();
        const config = makeConfig();
        env.doc.body.innerHTML = `<script type="application/json" id="consent-config">${JSON.stringify(config)}</script>`;

        expect(readConsentConfig(env.doc)).toEqual(config);
    });

    it('supports a custom element id', () => {
        env = makeEnv();
        env.doc.body.innerHTML = `<script type="application/json" id="cc">${JSON.stringify(makeConfig())}</script>`;

        expect(readConsentConfig(env.doc, 'cc').version).toBe('2026-10');
    });

    it('throws a ConsentError when the script is missing', () => {
        env = makeEnv();

        expect(() => readConsentConfig(env.doc)).toThrow(ConsentError);
        expect(() => readConsentConfig(env.doc)).toThrow('consent: #consent-config script missing or invalid');
    });

    it.each([
        ['invalid JSON', '{nope'],
        ['a non-object', '"x"'],
        ['a missing version', JSON.stringify({ categories: [] })],
        ['missing categories', JSON.stringify({ version: '1' })],
    ])('throws a ConsentError for %s', (_label, body) => {
        env = makeEnv();
        env.doc.body.innerHTML = `<script type="application/json" id="consent-config">${body}</script>`;

        expect(() => readConsentConfig(env.doc)).toThrow(ConsentError);
    });
});
