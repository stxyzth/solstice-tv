/* Solstice TV — EPG engine: per-channel short EPG + optional full xmltv.gz guide. */
(function () {
    'use strict';
    var U = XTV.util;

    var shortCache = {};        // streamId -> {ts, list}
    var full = null;            // {byChannel: {chId: [programs]}, loadedAt}
    var fullLoading = null;

    function offsetMs() {
        return (XTV.store.settings().epgOffsetHours || 0) * 3600 * 1000;
    }

    function getShort(streamId, limit) {
        var c = shortCache[streamId];
        if (c && Date.now() - c.ts < 5 * 60 * 1000) return Promise.resolve(c.list);
        return XTV.xtream.shortEpg(streamId, limit || 6).then(function (list) {
            shortCache[streamId] = { ts: Date.now(), list: list };
            return list;
        }).catch(function () { return []; });
    }

    function loadFull(force) {
        if (!XTV.xtream.active() || !XTV.store.settings().fullEpg) return Promise.resolve(null);
        if (full && !force && Date.now() - full.loadedAt < 3 * 3600 * 1000) return Promise.resolve(full);
        if (fullLoading) return fullLoading;
        fullLoading = new Promise(function (resolve) {
            XTV.net.request({ url: XTV.xtream.epgUrl(), responseType: 'arraybuffer', timeout: 120000 }, function (err, buf) {
                fullLoading = null;
                if (err || !buf) return resolve(null);
                var data = new Uint8Array(buf);
                try {
                    if (data.length > 2 && data[0] === 0x1f && data[1] === 0x8b && window.pako) {
                        data = pako.ungzip(data);
                    }
                    parseXmltv(bytesToUtf8(data));
                    resolve(full);
                } catch (e) {
                    resolve(null);
                }
            });
        });
        return fullLoading;
    }

    function bytesToUtf8(data) {
        // XMLTV is UTF-8: decode properly (TextDecoder on modern engines,
        // escape-trick fallback for Chromium 38) or multibyte titles turn to mojibake
        if (window.TextDecoder) {
            try { return new TextDecoder('utf-8').decode(data); } catch (e) {}
        }
        var s = '', chunk = 65536;
        for (var i = 0; i < data.length; i += chunk) {
            s += String.fromCharCode.apply(null, data.subarray(i, Math.min(i + chunk, data.length)));
        }
        try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
    }

    function parseXmltv(text) {
        var byChannel = {};
        var doc;
        try { doc = new DOMParser().parseFromString(text, 'text/xml'); } catch (e) { return; }
        var programmes = doc.getElementsByTagName('programme');
        var off = offsetMs();
        for (var i = 0; i < programmes.length; i++) {
            var p = programmes[i];
            var ch = p.getAttribute('channel') || '';
            var start = parseXmltvTime(p.getAttribute('start'));
            var stop = parseXmltvTime(p.getAttribute('stop'));
            if (!start || !stop) continue;
            var title = '', desc = '';
            var tn = p.getElementsByTagName('title');
            if (tn.length) title = tn[0].textContent || '';
            var dn = p.getElementsByTagName('desc');
            if (dn.length) desc = dn[0].textContent || '';
            // strip xmltv tz suffix applied via offset setting (times arrive in server tz)
            var prog = { title: title, desc: desc, start: new Date(start - off), stop: new Date(stop - off) };
            (byChannel[ch] = byChannel[ch] || []).push(prog);
        }
        for (var c in byChannel) byChannel[c].sort(function (a, b) { return a.start - b.start; });
        full = { byChannel: byChannel, loadedAt: Date.now(), channelCount: Object.keys(byChannel).length };
    }

    function parseXmltvTime(s) {
        if (!s) return 0;
        var m = String(s).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?/);
        if (!m) return 0;
        return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
    }

    /* channel id used in xmltv: prefer explicit epg_channel_id, else stream id */
    function chKey(channel) {
        return channel.epgChannelId || channel.id;
    }

    function getPrograms(channel) {
        if (full && full.byChannel) return full.byChannel[chKey(channel)] || [];
        return [];
    }

    function nowNext(channel) {
        var list = getPrograms(channel);
        if (list.length) {
            var now = new Date();
            for (var i = 0; i < list.length; i++) {
                if (list[i].start <= now && now < list[i].stop) {
                    return { now: list[i], next: list[i + 1] || null };
                }
            }
            // not loaded around now — nearest upcoming
            for (var j = 0; j < list.length; j++) {
                if (list[j].start > now) return { now: null, next: list[j] };
            }
            return { now: null, next: null };
        }
        // fall back to short EPG (cached, single-flight)
        if (nowNext._pending && nowNext._pending[channel.id]) return nowNext._pending[channel.id];
        nowNext._pending = nowNext._pending || {};
        var p = getShort(channel.id, 2).then(function (list2) {
            delete nowNext._pending[channel.id];
            return { now: list2[0] || null, next: list2[1] || null };
        });
        nowNext._pending[channel.id] = p;
        return p;
    }

    function clearShortCache() { shortCache = {}; }

    XTV.epg = {
        getShort: getShort,
        loadFull: loadFull,
        getPrograms: getPrograms,
        nowNext: nowNext,
        clearShortCache: clearShortCache,
        isFullLoaded: function () { return !!full; },
        fullInfo: function () { return full; }
    };
})();
