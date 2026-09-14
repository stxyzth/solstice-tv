/* Solstice TV — Mobile Edit: pair with the phone companion over the LAN sync server.
   Starts on demand from Settings; keeps polling while the app runs. */
(function () {
    'use strict';
    var U = XTV.util;

    var KEYS = ['accent', 'ambient', 'preferNative', 'bufferSec', 'autoplayNext', 'markWatchedPct',
        'epgOffsetHours', 'fullEpg', 'hideAdult', 'subtitleLang', 'tmdbKey', 'omdbKey', 'osKey', 'displayClock'];

    var running = false, pair = null, lastV = 0, base = '', qrUrl = '', listener = null, status = 'off';

    function setStatus(s, extra) {
        status = s;
        if (listener) { try { listener(s, extra || {}); } catch (e) {} }
    }

    function sameOriginHttp() {
        return location.protocol === 'http:' || location.protocol === 'https:';
    }

    function detectBase(cb) {
        if (!sameOriginHttp()) return cb(null);
        XTV.net.request({ url: '/api/host', responseType: 'json', timeout: 2500 }, function (err, host) {
            if (err || !host || !host.ip) return cb(null);
            base = 'http://' + host.ip + ':' + host.port;
            cb({ ip: host.ip, port: host.port });
        });
    }

    function seed() {
        var s = XTV.store.settings(), out = {};
        KEYS.forEach(function (k) { out[k] = s[k]; });
        XTV.net.request({
            url: base + '/api/state/' + pair, method: 'POST',
            responseType: 'json', timeout: 5000,
            body: JSON.stringify({ settings: out })
        }, function (err, resp) {
            if (!err && resp && resp.v) lastV = resp.v;
            poll();
        });
    }

    function poll() {
        if (!running) return;
        XTV.net.request({
            url: base + '/api/wait/' + pair + '?v=' + lastV,
            responseType: 'text', timeout: 30000
        }, function (err, txt) {
            if (!running) return;
            if (!err && txt) {
                try {
                    var st = JSON.parse(txt);
                    if (st && st.settings) {
                        lastV = st.v;
                        var n = XTV.app.applyExternalSettings(st.settings);
                        setStatus('applied', { changes: n, v: st.v });
                    }
                } catch (e) {}
            }
            setTimeout(poll, err ? 1500 : 30);
        });
    }

    /* public API */
    function start(cb) {
        if (running) return cb && cb(true);
        setStatus('connecting');
        detectBase(function (host) {
            if (!host) {
                setStatus('unavailable');
                return cb && cb(false);
            }
            pair = String(Math.floor(100000 + Math.random() * 900000));
            qrUrl = base + '/remote/index.html#' + pair;
            running = true;
            setStatus('paired', { pair: pair, qrUrl: qrUrl });
            seed();
        });
    }

    function stop() {
        running = false;
        pair = null;
        setStatus('off');
    }

    XTV.remote = {
        start: start,
        stop: stop,
        isRunning: function () { return running; },
        getPair: function () { return pair; },
        getQrUrl: function () { return qrUrl; },
        getStatus: function () { return status; },
        setListener: function (cb) { listener = cb; },
        KEYS: KEYS
    };
})();
