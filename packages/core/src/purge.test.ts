import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeConfig, makeEnv, seedCookies, tick } from './__tests__/support';
import type { TestEnv } from './__tests__/support';
import { parentDomains, purgeCategoryCookies } from './purge';
import type { ConsentCategory } from './types';

const config = makeConfig();
const category = (key: string): ConsentCategory => config.categories.find((c) => c.key === key) as ConsentCategory;

describe('purge', () => {
    let env: TestEnv;

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(async () => {
        await env.close();
        vi.useRealTimers();
    });

    it('computes parent domains with at least two labels', () => {
        env = makeEnv();

        expect(parentDomains('www.netipar.hu')).toEqual(['www.netipar.hu', 'netipar.hu']);
        expect(parentDomains('netipar.hu')).toEqual(['netipar.hu']);
        expect(parentDomains('localhost')).toEqual([]);
    });

    it('deletes exact names and prefix patterns, leaving everything else', () => {
        env = makeEnv();
        seedCookies(env.doc, '_ga=1; _ga_ABC=2; _gid=3; _gcl_au=4; _gcl_aw=5; keep_me=6; XSRF-TOKEN=7');

        const deleted = purgeCategoryCookies(env.doc, category('analytics'));
        tick();

        expect(deleted).toEqual(['_ga', '_ga_ABC', '_gid']);
        expect(env.names().sort()).toEqual(['XSRF-TOKEN', '_gcl_au', '_gcl_aw', 'keep_me']);
    });

    it('writes host-only, hostname and parent-domain deletions through the injected writer', () => {
        env = makeEnv('https://www.netipar.hu/');
        env.doc.cookie = '_ga=1; Path=/; Domain=netipar.hu';
        env.doc.cookie = '_gid=3; Path=/';
        const writes: string[] = [];

        const deleted = purgeCategoryCookies(env.doc, category('analytics'), (cookieString) => {
            writes.push(cookieString);
            env.doc.cookie = cookieString;
        });
        tick();

        expect(deleted).toEqual(['_ga', '_gid']);
        expect(writes.filter((w) => /^_ga=; Max-Age=0; Path=\/; Domain=netipar\.hu$/.test(w))).toHaveLength(1);
        expect(writes.filter((w) => w.startsWith('_ga='))).toEqual([
            '_ga=; Max-Age=0; Path=/',
            '_ga=; Max-Age=0; Path=/; Domain=www.netipar.hu',
            '_ga=; Max-Age=0; Path=/; Domain=netipar.hu',
        ]);
        expect(env.doc.cookie).toBe('');
    });

    it('writes host-only and Domain=hostname on a single-label host', () => {
        env = makeEnv('http://localhost:3000/');
        seedCookies(env.doc, '_ga=1');
        const writes: string[] = [];

        purgeCategoryCookies(env.doc, category('analytics'), (cookieString) => writes.push(cookieString));

        expect(writes).toEqual(['_ga=; Max-Age=0; Path=/', '_ga=; Max-Age=0; Path=/; Domain=localhost']);
    });

    it('never purges a required category', () => {
        env = makeEnv();
        seedCookies(env.doc, 'session=1');
        const required: ConsentCategory = { ...category('necessary'), cookies: ['session'] };

        expect(purgeCategoryCookies(env.doc, required)).toEqual([]);
        tick();
        expect(env.names()).toEqual(['session']);
    });
});
