/* Solstice TV — persistent store: profiles, settings, favorites, history, watch progress. */
(function () {
    'use strict';
    var U = XTV.util;
    var KEY = 'xtv.v1';

    var DEFAULT_SETTINGS = {
        tmdbKey: '',
        omdbKey: '',
        osKey: '',                // OpenSubtitles API key (optional)
        subtitleLang: 'en',
        accent: '#0a84ff',
        ambient: true,            // blurred backdrop behind rows
        preferNative: true,       // prefer TV native media pipeline over hls.js
        bufferSec: 30,            // target buffer for hls.js
        autoplayNext: true,
        markWatchedPct: 90,
        skipIntroSec: 120,
        epgOffsetHours: 0,        // server timezone correction
        fullEpg: true,            // load full xmltv guide when available
        hideAdult: true,
        pinEnabled: false,
        pin: '',
        displayClock: true
    };

    var S = null;      // state
    var saveT = null;

    function blank() {
        return {
            profiles: [],
            activeProfileId: null,
            settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
            favorites: { live: {}, movie: {}, series: {} },
            history: [],
            progress: {},
            watched: {}   // "ep:<seriesId>:<s>:<e>" -> 1
        };
    }

    function load() {
        var raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) {}
        S = blank();
        if (raw) {
            try {
                var p = JSON.parse(raw);
                Object.assign(S, p);
                S.settings = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), p.settings || {});
                S.favorites = Object.assign({ live: {}, movie: {}, series: {} }, p.favorites || {});
                S.progress = p.progress || {};
                S.watched = p.watched || {};
                S.history = p.history || [];
            } catch (e) { S = blank(); }
        }
        return S;
    }

    function save() {
        clearTimeout(saveT);
        saveT = setTimeout(function () {
            try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {
                // storage full — drop progress entries and retry once
                S.progress = {};
                try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e2) {}
            }
        }, 120);
    }

    /* ---------- profiles ---------- */
    function profiles() { return S.profiles; }
    function activeProfile() {
        for (var i = 0; i < S.profiles.length; i++)
            if (S.profiles[i].id === S.activeProfileId) return S.profiles[i];
        return S.profiles[0] || null;
    }
    function upsertProfile(p) {
        p.id = p.id || 'p' + Date.now();
        for (var i = 0; i < S.profiles.length; i++) {
            if (S.profiles[i].id === p.id) { S.profiles[i] = p; save(); return p; }
        }
        S.profiles.push(p);
        save();
        return p;
    }
    function removeProfile(id) {
        S.profiles = S.profiles.filter(function (p) { return p.id !== id; });
        if (S.activeProfileId === id) S.activeProfileId = S.profiles.length ? S.profiles[0].id : null;
        save();
    }
    function setActiveProfile(id) { S.activeProfileId = id; save(); }

    /* ---------- settings ---------- */
    function settings() { return S.settings; }
    function setSetting(k, v) { S.settings[k] = v; save(); }

    /* ---------- favorites ---------- */
    function isFav(kind, id) { return !!S.favorites[kind][String(id)]; }
    function toggleFav(kind, id, meta) {
        var k = String(id);
        if (S.favorites[kind][k]) delete S.favorites[kind][k];
        else S.favorites[kind][k] = meta || 1;
        save();
        return !!S.favorites[kind][k];
    }
    function favMap(kind) { return S.favorites[kind] || {}; }

    /* ---------- history ---------- */
    function pushHistory(item) {
        S.history = S.history.filter(function (h) {
            return !(h.kind === item.kind && h.id === item.id && h.season === item.season && h.ep === item.ep);
        });
        item.at = Date.now();
        S.history.unshift(item);
        if (S.history.length > 80) S.history.length = 80;
        save();
    }
    function history() { return S.history; }

    /* ---------- progress ---------- */
    function progKey(kind, id, season, ep) {
        return kind + ':' + id + (kind === 'ep' && season != null ? ':' + season + ':' + ep : '');
    }
    function setProgress(kind, id, season, ep, pos, dur, meta) {
        var k = progKey(kind, id, season, ep);
        var prev = S.progress[k] || {};
        var rec = {
            pos: pos, dur: dur, ts: Date.now(),
            kind: kind, id: id, season: season, ep: ep,
            meta: meta || prev.meta || null
        };
        S.progress[k] = rec;
        // auto-mark watched for episodes past threshold
        if (kind === 'ep' && dur > 0 && pos / dur * 100 >= settings().markWatchedPct) {
            markWatched(id, season, ep, true);
            rec.pos = 0;
        }
        var keys = Object.keys(S.progress);
        if (keys.length > 300) {
            keys.sort(function (a, b) { return S.progress[a].ts - S.progress[b].ts; });
            for (var i = 0; i < keys.length - 300; i++) delete S.progress[keys[i]];
        }
        save();
        return rec;
    }
    function getProgress(kind, id, season, ep) {
        return S.progress[progKey(kind, id, season, ep)] || null;
    }
    function continueWatching() {
        var pct = settings().markWatchedPct;
        var out = [];
        for (var k in S.progress) {
            var p = S.progress[k];
            if (!p.meta || !p.dur) continue;
            var frac = p.pos / p.dur;
            if (frac < 0.02 || frac * 100 >= pct) continue;
            out.push(p);
        }
        out.sort(function (a, b) { return b.ts - a.ts; });
        return out.slice(0, 20);
    }

    /* recently watched = progress entries + plain history, incl. fully watched */
    function recentlyWatchedSeries() {
        var entries = [], k, p;
        for (k in S.progress) {
            p = S.progress[k];
            if (p.kind === 'ep' && p.meta && p.meta.seriesId != null) entries.push(p);
        }
        S.history.forEach(function (h) {
            if (h.kind === 'series') entries.push({
                ts: h.at, id: h.id, season: null, ep: null, pos: 0, dur: 0,
                meta: { seriesId: h.id, title: h.title, icon: h.icon }
            });
        });
        entries.sort(function (a, b) { return b.ts - a.ts; });
        var seen = {}, out = [];
        for (var i = 0; i < entries.length && out.length < 20; i++) {
            p = entries[i];
            var sid = String(p.meta.seriesId);
            if (seen[sid]) continue;
            seen[sid] = 1;
            out.push({
                seriesId: p.meta.seriesId, season: p.season, ep: p.ep, ts: p.ts,
                title: p.meta.title, icon: p.meta.icon, frac: p.dur ? p.pos / p.dur : 0
            });
        }
        return out;
    }

    function recentlyWatchedMovies() {
        var entries = [];
        for (var k in S.progress) {
            var p = S.progress[k];
            if (p.kind === 'movie' && p.meta) entries.push(p);
        }
        S.history.forEach(function (h) {
            if (h.kind === 'movie') entries.push({
                ts: h.at, kind: 'movie', id: h.id, season: null, ep: null, pos: 0, dur: 0,
                meta: { title: h.title, icon: h.icon }
            });
        });
        entries.sort(function (a, b) { return b.ts - a.ts; });
        var seen = {}, out = [];
        for (var i = 0; i < entries.length && out.length < 20; i++) {
            var e = entries[i];
            var mid = String(e.id);
            if (seen[mid]) continue;
            seen[mid] = 1;
            out.push({ id: e.id, ts: e.ts, pos: e.pos || 0, dur: e.dur || 0, title: e.meta.title, icon: e.meta.icon, frac: e.dur ? e.pos / e.dur : 0 });
        }
        return out;
    }
    function markWatched(seriesId, season, ep, watched) {
        var k = 'ep:' + seriesId + ':' + season + ':' + ep;
        if (watched) S.watched[k] = 1; else delete S.watched[k];
        save();
    }
    function isWatched(seriesId, season, ep) {
        return !!S.watched['ep:' + seriesId + ':' + season + ':' + ep];
    }
    function seasonProgress(seriesId, season, episodes) {
        var n = 0;
        for (var i = 0; i < episodes.length; i++)
            if (isWatched(seriesId, season, episodes[i].episode)) n++;
        return { watched: n, total: episodes.length };
    }

    function clearAllProgress() { S.progress = {}; S.watched = {}; S.history = []; save(); }
    function clearCache() {
        return XTV.idb.clear();
    }

    function wipe() {
        S = blank();
        try { localStorage.removeItem(KEY); } catch (e) {}
    }

    load();

    XTV.store = {
        load: load, save: save,
        profiles: profiles, activeProfile: activeProfile,
        upsertProfile: upsertProfile, removeProfile: removeProfile, setActiveProfile: setActiveProfile,
        settings: settings, setSetting: setSetting,
        isFav: isFav, toggleFav: toggleFav, favMap: favMap,
        pushHistory: pushHistory, history: history,
        setProgress: setProgress, getProgress: getProgress, continueWatching: continueWatching,
        recentlyWatchedSeries: recentlyWatchedSeries, recentlyWatchedMovies: recentlyWatchedMovies,
        markWatched: markWatched, isWatched: isWatched, seasonProgress: seasonProgress,
        clearAllProgress: clearAllProgress, clearCache: clearCache, wipe: wipe,
        _state: function () { return S; }
    };
})();
