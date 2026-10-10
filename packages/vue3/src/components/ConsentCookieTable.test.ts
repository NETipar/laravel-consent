import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { CookieTableCategory } from '@netipar/consent-core';
import { ConsentCookieTable } from './ConsentCookieTable';

const headings = { name: 'Süti', provider: 'Szolgáltató', purpose: 'Cél', lifetime: 'Élettartam' };

const categories: CookieTableCategory[] = [
    {
        key: 'necessary',
        label: 'Szükséges',
        description: 'Az oldal működéséhez kell',
        required: true,
        cookies: [
            { name: 'laravel_session', provider: 'Ez az oldal', purpose: 'Bejelentkezve tart', lifetime: 'Munkamenet', domain: null },
        ],
    },
    {
        key: 'analytics',
        label: 'Analitika',
        description: 'Statisztika',
        required: false,
        cookies: [
            { name: '_ga', provider: 'Google Analytics', purpose: 'Mérés', lifetime: '2 év', domain: '.example.com' },
        ],
    },
    { key: 'marketing', label: 'Marketing', description: 'Hirdetések', required: false, cookies: [] },
];

describe('ConsentCookieTable', () => {
    it('renders one section per category with the data attributes', () => {
        const wrapper = mount(ConsentCookieTable, { props: { categories, headings } });
        const sections = wrapper.findAll('section');

        expect(wrapper.attributes()).toHaveProperty('data-consent-cookie-table');
        expect(sections.map((s) => s.attributes('data-consent-category'))).toEqual(['necessary', 'analytics', 'marketing']);
        expect(sections.map((s) => s.attributes('data-consent-required'))).toEqual(['true', 'false', 'false']);
        expect(sections[0].find('h3').text()).toBe('Szükséges');
        expect(sections[0].find('p').text()).toBe('Az oldal működéséhez kell');
    });

    it('renders the headings prop and the entry fields, domain in <small>', () => {
        const wrapper = mount(ConsentCookieTable, { props: { categories, headings } });
        const analytics = wrapper.findAll('section')[1];

        expect(analytics.findAll('th').map((th) => th.text())).toEqual(['Süti', 'Szolgáltató', 'Cél', 'Élettartam']);
        expect(analytics.findAll('th').every((th) => th.attributes('scope') === 'col')).toBe(true);

        const cells = analytics.findAll('tbody td');
        expect(cells.map((td) => td.text())).toEqual(['_ga (.example.com)', 'Google Analytics', 'Mérés', '2 év']);
        expect(cells[0].find('small').text()).toBe('(.example.com)');

        const necessary = wrapper.findAll('section')[0];
        expect(necessary.findAll('tbody td').map((td) => td.text())).toEqual([
            'laravel_session',
            'Ez az oldal',
            'Bejelentkezve tart',
            'Munkamenet',
        ]);
        expect(necessary.find('small').exists()).toBe(false);
    });

    it('renders an empty marker instead of a table for a category without cookies', () => {
        const section = mount(ConsentCookieTable, { props: { categories, headings } }).findAll('section')[2];

        expect(section.find('table').exists()).toBe(false);
        expect(section.find('[data-consent-empty]').exists()).toBe(true);
    });

    it('filters by `only`', () => {
        const wrapper = mount(ConsentCookieTable, { props: { categories, headings, only: ['analytics'] } });

        expect(wrapper.findAll('section')).toHaveLength(1);
        expect(wrapper.find('section').attributes('data-consent-category')).toBe('analytics');
    });

    it('hides categories without cookies when showEmpty is false', () => {
        const wrapper = mount(ConsentCookieTable, { props: { categories, headings, showEmpty: false } });

        expect(wrapper.findAll('section').map((s) => s.attributes('data-consent-category'))).toEqual(['necessary', 'analytics']);
    });

    it('hands the filtered categories and headings to the scoped slot', () => {
        let received: { categories: CookieTableCategory[]; headings: typeof headings } | null = null;

        const wrapper = mount(ConsentCookieTable, {
            props: { categories, headings, only: ['necessary', 'marketing'], showEmpty: false },
            slots: {
                default: (props: { categories: CookieTableCategory[]; headings: typeof headings }) => {
                    received = props;

                    return props.categories.map((category) => `${category.key}:${props.headings.name}`).join('|');
                },
            },
        });

        expect(received).not.toBeNull();
        expect(received!.categories.map((c) => c.key)).toEqual(['necessary']);
        expect(received!.headings).toEqual(headings);
        expect(wrapper.find('section').exists()).toBe(false);
        expect(wrapper.text()).toBe('necessary:Süti');
        expect(wrapper.attributes()).toHaveProperty('data-consent-cookie-table');
    });

    it('passes attributes through to the root', () => {
        const wrapper = mount(ConsentCookieTable, { props: { categories, headings }, attrs: { class: 'policy-cookies' } });

        expect(wrapper.classes()).toContain('policy-cookies');
    });
});
