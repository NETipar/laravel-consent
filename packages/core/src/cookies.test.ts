import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEnv, tick } from './__tests__/support';
import type { TestEnv } from './__tests__/support';
import { deleteCookie, expireEverywhere, readCookie, writeCookie } from './cookies';

const base = { maxAgeSeconds: 100, domain: null, sameSite: 'Lax' as const, secure: null };

describe('cookies', () => {
    let env: TestEnv;

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(async () => {
        await env.close();
        vi.useRealTimers();
    });

    it('reads a decoded value and tolerates "=" inside values', () => {
        env = makeEnv();
        env.doc.cookie = '_ga=GA1.1=x; Path=/';
        env.doc.cookie = '__cookie_consent=necessary%2Cmarketing; Path=/';

        expect(readCookie(env.doc, '_ga')).toBe('GA1.1=x');
        expect(readCookie(env.doc, '__cookie_consent')).toBe('necessary,marketing');
        expect(readCookie(env.doc, 'missing')).toBeNull();
    });

    it('writes name=encoded; Max-Age; Path; SameSite in order', () => {
        env = makeEnv();

        const written = writeCookie(env.doc, '__cookie_consent', 'necessary,analytics', { ...base, domain: 'example.test' });

        expect(written).toBe('__cookie_consent=necessary%2Canalytics; Max-Age=100; Path=/; SameSite=Lax; Domain=example.test');
    });

    it('omits Secure for secure:null under http:', () => {
        env = makeEnv('http://localhost:3000/');

        const written = writeCookie(env.doc, 'a', '1', base);

        expect(written).not.toContain('Secure');
        expect(readCookie(env.doc, 'a')).toBe('1');
    });

    it('adds Secure for secure:null under https:', () => {
        env = makeEnv('https://www.netipar.hu/');

        expect(writeCookie(env.doc, 'a', '1', base)).toMatch(/; Secure$/);
    });

    it('forces Secure when SameSite=None, even with secure:false under http:', () => {
        env = makeEnv('http://localhost:3000/');

        expect(writeCookie(env.doc, 'a', '1', { ...base, sameSite: 'None', secure: false })).toBe(
            'a=1; Max-Age=100; Path=/; SameSite=None; Secure',
        );
    });

    it('deletes a cookie with Max-Age=0', () => {
        env = makeEnv();
        env.doc.cookie = 'a=1; Path=/';

        expect(deleteCookie(env.doc, 'a', null)).toBe('a=; Max-Age=0; Path=/');
        tick();

        expect(readCookie(env.doc, 'a')).toBeNull();
    });

    it('expireEverywhere removes host-only, configured-domain and parent-domain variants', () => {
        env = makeEnv('http://www.example.test/');
        const written: string[] = [];
        env.doc.cookie = 'a=host; Path=/';
        env.doc.cookie = 'a=domain; Path=/; Domain=.example.test';
        env.doc.cookie = 'a=hostname; Path=/; Domain=www.example.test';
        const spy = vi.spyOn(env.doc, 'cookie', 'set').mockImplementation((value: string) => {
            written.push(value);
        });

        expireEverywhere(env.doc, 'a', '.example.test');
        spy.mockRestore();

        expect(written).toEqual([
            'a=; Max-Age=0; Path=/',
            'a=; Max-Age=0; Path=/; Domain=.example.test',
            'a=; Max-Age=0; Path=/; Domain=www.example.test',
        ]);
    });
});
