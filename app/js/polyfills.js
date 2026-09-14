/* Solstice TV — polyfills for webOS 3/4/5 (Chromium 38+). Load first. */
(function () {
    'use strict';

    if (!Object.assign) {
        Object.assign = function (t) {
            if (t == null) throw new TypeError('Cannot convert to object');
            for (var i = 1, a = arguments; i < a.length; i++) {
                var s = a[i];
                if (s == null) continue;
                for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k];
            }
            return t;
        };
    }

    if (!Array.from) {
        Array.from = function (like) {
            var out = [];
            if (like && like.length) for (var i = 0; i < like.length; i++) out.push(like[i]);
            return out;
        };
    }

    if (!Array.prototype.find) {
        Array.prototype.find = function (fn) {
            for (var i = 0; i < this.length; i++) if (fn(this[i], i, this)) return this[i];
            return undefined;
        };
    }
    if (!Array.prototype.findIndex) {
        Array.prototype.findIndex = function (fn) {
            for (var i = 0; i < this.length; i++) if (fn(this[i], i, this)) return i;
            return -1;
        };
    }
    if (!Array.prototype.includes) {
        Array.prototype.includes = function (v) { return this.indexOf(v) !== -1; };
    }
    if (!String.prototype.includes) {
        String.prototype.includes = function (s) { return this.indexOf(s) !== -1; };
    }
    if (!String.prototype.startsWith) {
        String.prototype.startsWith = function (s) { return this.lastIndexOf(s, 0) === 0; };
    }
    if (!String.prototype.endsWith) {
        String.prototype.endsWith = function (s) {
            var p = this.length - s.length;
            return p >= 0 && this.lastIndexOf(s) === p;
        };
    }
    if (!String.prototype.trim) {
        String.prototype.trim = function () { return this.replace(/^\s+|\s+$/g, ''); };
    }

    if (!Element.prototype.matches) {
        Element.prototype.matches =
            Element.prototype.webkitMatchesSelector ||
            Element.prototype.mozMatchesSelector ||
            function (sel) {
                var p = this.parentNode, all = p ? p.querySelectorAll(sel) : [];
                for (var i = 0; i < all.length; i++) if (all[i] === this) return true;
                return false;
            };
    }
    if (!Element.prototype.closest) {
        Element.prototype.closest = function (sel) {
            var el = this;
            while (el && el.nodeType === 1) {
                if (el.matches(sel)) return el;
                el = el.parentElement;
            }
            return null;
        };
    }

    // NOTE: never touch Element.prototype.classList directly — the getter throws
    // "Illegal invocation" when invoked on the prototype. Use `in` instead.
    if (!('classList' in Element.prototype)) {
        // minimal classList for very old engines
        function CL(el) { this.el = el; }
        CL.prototype._set = function (add, names) {
            var cur = (' ' + this.el.className + ' ').replace(/\s+/g, ' ');
            for (var i = 0; i < names.length; i++) {
                var n = ' ' + names[i] + ' ';
                if (add && cur.indexOf(n) === -1) cur += names[i] + ' ';
                if (!add) cur = cur.split(n).join(' ');
            }
            this.el.className = cur.trim();
        };
        CL.prototype.add = function () { this._set(true, Array.prototype.slice.call(arguments)); };
        CL.prototype.remove = function () { this._set(false, Array.prototype.slice.call(arguments)); };
        CL.prototype.toggle = function (n, force) {
            var has = (' ' + this.el.className + ' ').indexOf(' ' + n + ' ') !== -1;
            var want = force === undefined ? !has : !!force;
            this._set(want, [n]);
            return want;
        };
        CL.prototype.contains = function (n) {
            return (' ' + this.el.className + ' ').indexOf(' ' + n + ' ') !== -1;
        };
        Object.defineProperty(Element.prototype, 'classList', {
            get: function () { return new CL(this); }
        });
    }

    // XHR-based network: avoids fetch (absent on Chromium <42) entirely.
    // XTV.net.request(opts, cb) — opts: {url, method, responseType:'json'|'text'|'arraybuffer',
    // timeout, headers, body} → cb(err, resp, xhr)
    window.XTV = window.XTV || {};
    XTV.net = {
        // Desktop browsers can't call IPTV portals cross-origin (no CORS headers).
        // When the app is served over HTTP outside webOS, cross-origin requests are
        // transparently relayed through the bundled sync server (/api/proxy).
        _relay: (location.protocol === 'http:' || location.protocol === 'https:') &&
                !(window.PalmSystem || window.webOS),
        request: function (opts, cb) {
            var url = opts.url;
            if (this._relay && /^https?:\/\//i.test(url)) {
                var tgtHost = url.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
                if (tgtHost !== location.host.toLowerCase()) {
                    url = '/api/proxy?url=' + encodeURIComponent(url);
                }
            }
            var xhr = new XMLHttpRequest();
            xhr.open(opts.method || 'GET', url, true);
            xhr.responseType = opts.responseType === 'json' ? 'text' : (opts.responseType || 'text');
            xhr.timeout = opts.timeout || 20000;
            if (opts.headers) {
                for (var h in opts.headers) try { xhr.setRequestHeader(h, opts.headers[h]); } catch (e) {}
            }
            var done = false;
            var finish = function (err, resp) {
                if (done) return;
                done = true;
                cb(err, resp, xhr);
            };
            xhr.onload = function () {
                var st = xhr.status;
                if (st >= 200 && st < 300 || st === 304) {
                    var resp = xhr.response;
                    if (opts.responseType === 'json') {
                        try { resp = JSON.parse(xhr.responseText); }
                        catch (e) { return finish(new Error('Bad JSON from ' + opts.url), xhr.responseText, xhr); }
                    }
                    finish(null, resp, xhr);
                } else {
                    finish(new Error('HTTP ' + st + ' for ' + opts.url), null, xhr);
                }
            };
            xhr.onerror = function () { finish(new Error('Network error: ' + opts.url), null, xhr); };
            xhr.ontimeout = function () { finish(new Error('Timeout: ' + opts.url), null, xhr); };
            xhr.onabort = function () { finish(new Error('Aborted: ' + opts.url), null, xhr); };
            if (opts.body) xhr.send(opts.body); else xhr.send();
            return xhr;
        },
        getJSON: function (url, timeout, cb) {
            if (typeof timeout === 'function') { cb = timeout; timeout = undefined; }
            XTV.net.request({ url: url, responseType: 'json', timeout: timeout }, cb);
        }
    };
})();
