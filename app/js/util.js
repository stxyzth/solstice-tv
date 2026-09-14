/* Solstice TV — shared utilities + tiny event emitter. */
(function () {
    'use strict';
    var U = {};

    U.$ = function (sel, root) { return (root || document).querySelector(sel); };
    U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
    U.byId = function (id) { return document.getElementById(id); };

    U.el = function (tag, cls, html) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    };

    U.esc = function (s) {
        if (s == null) return '';
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    };

    U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };

    U.pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

    U.fmtTime = function (sec) {
        sec = Math.max(0, Math.floor(sec || 0));
        var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        return h > 0 ? h + ':' + U.pad2(m) + ':' + U.pad2(s) : m + ':' + U.pad2(s);
    };

    U.fmtClock = function (ts) {
        var d = ts instanceof Date ? ts : new Date(ts);
        return U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
    };

    U.fmtAgo = function (ts) {
        var s = Math.floor((Date.now() - ts) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return Math.floor(s / 60) + 'm ago';
        if (s < 86400) return Math.floor(s / 3600) + 'h ago';
        return Math.floor(s / 86400) + 'd ago';
    };

    U.fmtDate = function (ts) {
        var d = ts instanceof Date ? ts : new Date(ts);
        var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return M[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    };

    U.debounce = function (fn, ms) {
        var t = null;
        return function () {
            var a = arguments, self = this;
            clearTimeout(t);
            t = setTimeout(function () { fn.apply(self, a); }, ms);
        };
    };

    U.throttle = function (fn, ms) {
        var last = 0, t = null, saved = null, self = null;
        return function () {
            var now = Date.now();
            saved = arguments; self = this;
            if (now - last >= ms) { last = now; fn.apply(self, saved); }
            else if (!t) {
                t = setTimeout(function () { t = null; last = Date.now(); fn.apply(self, saved); }, ms - (now - last));
            }
        };
    };

    U.randInt = function (a, b) { return a + Math.floor(Math.random() * (b - a + 1)); };

    U.parseUrl = function (raw) {
        var url = String(raw || '').trim();
        if (!url) return null;
        if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
        url = url.replace(/\/+$/, '');
        return url;
    };

    U.placeholder = function (title, kind, hue) {
        // inline SVG data-uri poster/wide placeholder so grids never look broken
        var t = String(title || '?').replace(/[<>&"']/g, '').trim();
        var initials = t.split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
        var h = hue == null ? (t.length * 47) % 360 : hue;
        var w2 = kind === 'wide' ? 320 : 176, h2 = kind === 'wide' ? 180 : 264;
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w2 + '" height="' + h2 + '">' +
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="hsl(' + h + ',42%,22%)"/>' +
            '<stop offset="1" stop-color="hsl(' + ((h + 40) % 360) + ',48%,10%)"/></linearGradient></defs>' +
            '<rect width="100%" height="100%" fill="url(#g)"/>' +
            '<text x="50%" y="52%" fill="hsla(' + h + ',60%,72%,0.85)" font-family="sans-serif" ' +
            'font-size="' + Math.round(w2 * 0.24) + '" font-weight="700" text-anchor="middle" dominant-baseline="middle">' + initials + '</text></svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    };

    // base64 that tolerates UTF-8 (Xtream EPG fields are base64 UTF-8)
    U.b64utf8 = function (s) {
        if (s == null) return '';
        if (!/[A-Za-z0-9+/=]/.test(s) || s.length < 8) return s; // plain text
        try {
            var bin = atob(s);
            try { return decodeURIComponent(escape(bin)); } catch (e) { return bin; }
        } catch (e) { return s; }
    };

    U.qs = function (obj) {
        var parts = [];
        for (var k in obj) {
            if (obj[k] === undefined || obj[k] === null) continue;
            parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]));
        }
        return parts.join('&');
    };

    UEmitter();
    function UEmitter() {
        function Emitter() { this._h = {}; }
        Emitter.prototype.on = function (ev, fn) {
            (this._h[ev] = this._h[ev] || []).push(fn);
            return this;
        };
        Emitter.prototype.off = function (ev, fn) {
            var a = this._h[ev];
            if (a) this._h[ev] = a.filter(function (f) { return f !== fn; });
            return this;
        };
        Emitter.prototype.emit = function (ev) {
            var a = this._h[ev], args = Array.prototype.slice.call(arguments, 1);
            if (a) for (var i = 0; i < a.length; i++) a[i].apply(null, args);
        };
        U.Emitter = Emitter;
    }

    XTV.util = U;
})();
