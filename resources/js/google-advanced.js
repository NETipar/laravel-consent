/* netipar/laravel-consent: Consent Mode v2 Advanced bootstrap, see ConsentManager::configScripts() */
function (c, w) {
    var MARKER = '__netiparConsentGoogle';
    var ORIGIN = 'https://www.googletagmanager.com';
    var SIGNALS = ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'];

    if (w[MARKER]) {
        return;
    }

    var d = w.document;
    var g = c.google;
    var current = d.currentScript;
    var nonce = (current && (current.nonce || current.getAttribute('nonce'))) || '';

    var read = function (name) {
        var parts = d.cookie.split(';');

        for (var i = 0; i < parts.length; i++) {
            var at = parts[i].indexOf('=');

            if ((at === -1 ? parts[i] : parts[i].slice(0, at)).trim() !== name) {
                continue;
            }

            var raw = at === -1 ? '' : parts[i].slice(at + 1).trim();

            try {
                return decodeURIComponent(raw);
            } catch (e) {
                return raw;
            }
        }

        return null;
    };

    var inject = function (src) {
        var script = d.createElement('script');

        script.async = true;
        script.src = src;

        if (nonce) {
            script.nonce = nonce;
            script.setAttribute('nonce', nonce);
        }

        (d.head || d.documentElement).appendChild(script);
    };

    if (c.cookie.domain !== null) {
        d.cookie = c.cookie.name + '=; Max-Age=0; Path=/';
        d.cookie = c.cookie.versionName + '=; Max-Age=0; Path=/';
    }

    var value = read(c.cookie.name);
    var keys = value !== null && read(c.cookie.versionName) === c.version
        ? value.split(',').map(function (key) { return key.trim(); })
        : [];
    var granted = c.categories
        .filter(function (category) { return category.required || keys.indexOf(category.key) !== -1; })
        .map(function (category) { return category.key; });

    var signals = {};

    SIGNALS.forEach(function (key) {
        signals[key] = granted.indexOf(g.signals[key]) !== -1 ? 'granted' : 'denied';
    });

    var tags = g.tags.map(function (tag) { return tag.id; });
    var containers = g.containers || [];
    var marker = { signals: signals, granted: granted, tags: tags, containers: [] };

    w[MARKER] = marker;
    w.dataLayer = w.dataLayer || [];
    w.gtag = w.gtag || function () {
        w.dataLayer.push(arguments);
    };

    w.gtag('consent', 'default', signals);

    if (g.adsDataRedaction) {
        w.gtag('set', 'ads_data_redaction', true);
    }

    if (g.urlPassthrough) {
        w.gtag('set', 'url_passthrough', true);
    }

    if (containers.length > 0 && g.updateEvent !== null) {
        w.dataLayer.push({ consent_granted: granted });
    }

    if (tags.length > 0) {
        inject(ORIGIN + '/gtag/js?id=' + encodeURIComponent(tags[0]));
        w.gtag('js', new Date());
        tags.forEach(function (id) { w.gtag('config', id); });
    }

    containers.forEach(function (container) {
        var src = ORIGIN + '/gtm.js?id=' + encodeURIComponent(container.id);
        var present = Array.prototype.some.call(d.querySelectorAll('script[src]'), function (el) {
            return el.getAttribute('src') === src;
        });

        if (!present) {
            w.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
            inject(src);
        }

        marker.containers.push(container.id);
    });
}
