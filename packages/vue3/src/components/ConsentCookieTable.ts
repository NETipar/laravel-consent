import { computed, defineComponent, h, type PropType, type VNode } from 'vue';
import type { CookieTableCategory, CookieTableEntry } from '@netipar/consent-core';

export interface CookieTableHeadings {
    name: string;
    provider: string;
    purpose: string;
    lifetime: string;
}

/**
 * Renderless cookie table (D27). The data is server-resolved: pass the result of
 * `Consent::cookieTable()` as `categories` (e.g. an Inertia prop) and the translated
 * `__('consent::consent.cookies.headings')` as `headings` — the component never fetches
 * and holds no user-facing literal. The default scoped slot receives the filtered
 * `categories` and `headings`; without a slot it renders the same unstyled structure as
 * the Blade `<x-consent::cookie-table>` component.
 */
export const ConsentCookieTable = defineComponent({
    name: 'ConsentCookieTable',
    props: {
        categories: { type: Array as PropType<CookieTableCategory[]>, required: true },
        only: { type: Array as PropType<string[] | null>, default: null },
        headings: { type: Object as PropType<CookieTableHeadings>, required: true },
        showEmpty: { type: Boolean, default: true },
    },
    setup(props, { slots }) {
        const visible = computed<CookieTableCategory[]>(() =>
            props.categories.filter(
                (category) =>
                    (props.only === null || props.only.includes(category.key)) &&
                    (props.showEmpty || category.cookies.length > 0),
            ),
        );

        const row = (cookie: CookieTableEntry): VNode =>
            h('tr', [
                h('td', cookie.domain ? [cookie.name, ' ', h('small', `(${cookie.domain})`)] : cookie.name),
                h('td', cookie.provider ?? ''),
                h('td', cookie.purpose ?? ''),
                h('td', cookie.lifetime ?? ''),
            ]);

        const section = (category: CookieTableCategory): VNode =>
            h(
                'section',
                {
                    key: category.key,
                    'data-consent-category': category.key,
                    'data-consent-required': category.required ? 'true' : 'false',
                },
                [
                    h('h3', category.label),
                    h('p', category.description),
                    category.cookies.length > 0
                        ? h('table', [
                              h(
                                  'thead',
                                  h('tr', [
                                      h('th', { scope: 'col' }, props.headings.name),
                                      h('th', { scope: 'col' }, props.headings.provider),
                                      h('th', { scope: 'col' }, props.headings.purpose),
                                      h('th', { scope: 'col' }, props.headings.lifetime),
                                  ]),
                              ),
                              h('tbody', category.cookies.map(row)),
                          ])
                        : h('p', { 'data-consent-empty': '' }),
                ],
            );

        // The root stays in both modes (like Blade): a slot replaces only what is inside it.
        return (): VNode =>
            h(
                'div',
                { 'data-consent-cookie-table': '' },
                slots.default
                    ? slots.default({ categories: visible.value, headings: props.headings })
                    : visible.value.map(section),
            );
    },
});
