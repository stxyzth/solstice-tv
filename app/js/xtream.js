/* Solstice TV — Xtream Codes API client (player_api.php) with catalog caching. */
(function () {
    'use strict';
    var U = XTV.util;

    var P = null;   // active profile {url, username, password, ...}
    var INFO = null; // user_info + server_info from auth()

    function init(profile) {
        P = profile;
        INFO = null;
    }

    function base() {
        return P ? U.parseUrl(P.url) : null;
    }

    function creds() {
        return 'username=' + encodeURIComponent(P.username) + '&password=' + encodeURIComponent(P.password);
    }

    function api(params, timeout) {
        var qs = creds();
        for (var k in params) if (params[k] !== undefined && params[k] !== null)
            qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
        var url = base() + '/player_api.php?' + qs;
        return new Promise(function (resolve, reject) {
            XTV.net.getJSON(url, timeout || 25000, function (err, json) {
                if (err) return reject(err);
                if (json && json.user_info && json.user_info.auth === 0)
                    return reject(new Error('Authentication failed — check username/password'));
                resolve(json);
            });
        });
    }

    function auth() {
        return api({}, 15000).then(function (j) {
            if (!j || !j.user_info) throw new Error('Not a valid Xtream Codes portal');
            INFO = j;
            return j;
        });
    }

    function info() { return INFO; }

    /* ---------- catalog ---------- */

    function normCat(list) {
        return (list || []).map(function (c) {
            return { id: String(c.category_id), name: c.category_name };
        });
    }

    function isAdult(name) {
        return /\b(xxx|adult|porn|18\+|erotic|for adults)\b/i.test(String(name || ''));
    }

    function normLive(list) {
        return (list || []).map(function (s) {
            return {
                kind: 'live',
                id: String(s.stream_id),
                num: s.num,
                name: s.name,
                icon: s.stream_icon || '',
                catId: String(s.category_id || ''),
                epgChannelId: s.epg_channel_id || '',
                added: parseInt(s.added, 10) || 0
            };
        });
    }

    function normVod(list) {
        return (list || []).map(function (s) {
            return {
                kind: 'movie',
                id: String(s.stream_id),
                name: s.name,
                icon: s.stream_icon || s.cover || '',
                catId: String(s.category_id || ''),
                rating: parseFloat(s.rating) || 0,
                added: parseInt(s.added, 10) || 0,
                container: s.container_extension || 'mp4'
            };
        });
    }

    function normSeries(list) {
        return (list || []).map(function (s) {
            return {
                kind: 'series',
                id: String(s.series_id),
                name: s.name,
                icon: s.cover || '',
                catId: String(s.category_id || ''),
                rating: parseFloat(s.rating) || 0,
                added: parseInt(s.last_modified, 10) || parseInt(s.added, 10) || 0,
                plot: s.plot || '',
                genre: s.genre || '',
                cast: s.cast || '',
                release: s.releaseDate || s.release || '',
                year: (String(s.releaseDate || s.release || '').match(/\d{4}/) || [''])[0]
            };
        });
    }

    function fetchCatalog() {
        var a = function (p) { return api(p, 35000); };
        return Promise.all([
            a({ action: 'get_live_categories' }),
            a({ action: 'get_live_streams' }),
            a({ action: 'get_vod_categories' }),
            a({ action: 'get_vod_streams' }),
            a({ action: 'get_series_categories' }),
            a({ action: 'get_series' })
        ]).then(function (r) {
            return {
                liveCats: normCat(r[0]),
                live: normLive(r[1]),
                vodCats: normCat(r[2]),
                vod: normVod(r[3]),
                serCats: normCat(r[4]),
                series: normSeries(r[5]),
                loadedAt: Date.now()
            };
        });
    }

    function catalogKey() {
        return 'catalog:' + base() + ':' + P.username;
    }

    function catalog(force) {
        if (!force) {
            return XTV.idb.get(catalogKey()).then(function (cached) {
                if (cached) return cached;
                return fetchCatalog().then(function (cat) {
                    XTV.idb.set(catalogKey(), cat, 6 * 3600 * 1000);
                    return cat;
                });
            });
        }
        return fetchCatalog().then(function (cat) {
            XTV.idb.set(catalogKey(), cat, 6 * 3600 * 1000);
            return cat;
        });
    }

    /* ---------- details ---------- */

    function vodInfo(id) {
        return api({ action: 'get_vod_info', vod_id: id }).then(function (j) {
            var i = (j && j.info) || {};
            return {
                id: id,
                name: (j.movie_data && j.movie_data.name) || i.name || '',
                icon: (j.movie_data && j.movie_data.stream_icon) || i.movie_image || i.cover_big || '',
                plot: i.plot || '',
                cast: i.cast || '',
                director: i.director || '',
                genre: i.genre || '',
                duration: i.duration || i.info && i.info.duration_secs || '',
                release: i.releasedate || i.release_date || '',
                year: (String(i.releasedate || i.release_date || '').match(/\d{4}/) || [''])[0],
                rating: parseFloat(i.rating) || 0,
                container: i.container_extension || 'mp4',
                youtube: i.youtube_trailer || '',
                video: i.video || {}
            };
        });
    }

    function seriesInfo(id) {
        return api({ action: 'get_series_info', series_id: id }).then(function (j) {
            var seasons = [], episodes = {};
            var rawEps = (j && j.episodes) || {};
            for (var s in rawEps) {
                var list = (rawEps[s] || []).map(function (e) {
                    var md = e.movie_data || e.info || {};
                    return {
                        id: String(e.id),
                        season: parseInt(e.season, 10) || parseInt(s, 10) || 1,
                        episode: parseInt(e.episode_num, 10) || 0,
                        name: e.title || ('Episode ' + e.episode_num),
                        icon: (e.info && e.info.movie_image) || md.cover_big || '',
                        plot: (e.info && e.info.plot) || md.plot || '',
                        duration: (e.info && (e.info.duration_secs || e.info.duration)) || 0,
                        container: e.container_extension || 'mp4',
                        added: parseInt(e.added, 10) || 0
                    };
                }).sort(function (a, b) { return a.episode - b.episode; });
                episodes[s] = list;
            }
            if (j && j.seasons && j.seasons.length) {
                seasons = j.seasons.map(function (x) {
                    return {
                        season: parseInt(x.season_number != null ? x.season_number : x.season, 10) || 0,
                        name: x.name || ('Season ' + x.season),
                        cover: x.cover || '',
                        episodes: parseInt(x.episode_count, 10) || 0,
                        plot: x.plot || ''
                    };
                });
            } else {
                for (var k in episodes) seasons.push({ season: parseInt(k, 10) || 1, name: 'Season ' + k, episodes: episodes[k].length });
                seasons.sort(function (a, b) { return a.season - b.season; });
            }
            return { id: id, seasons: seasons, episodes: episodes, info: (j && j.info) || {} };
        });
    }

    /* ---------- EPG ---------- */

    function shortEpg(streamId, limit) {
        return api({ action: 'get_short_epg', stream_id: streamId, limit: limit || 4 }, 12000).then(function (j) {
            var out = [];
            var list = (j && j.epg_listings) || [];
            for (var i = 0; i < list.length; i++) {
                var e = list[i];
                out.push({
                    title: U.b64utf8(e.title),
                    desc: U.b64utf8(e.description),
                    start: new Date(parseInt(e.start_timestamp, 10) * 1000),
                    stop: new Date(parseInt(e.stop_timestamp, 10) * 1000)
                });
            }
            return out;
        });
    }

    /* ---------- stream URLs ---------- */

    function liveUrl(id, ext) {
        return base() + '/live/' + encodeURIComponent(P.username) + '/' + encodeURIComponent(P.password) + '/' + id + '.' + (ext || 'm3u8');
    }

    function movieUrl(id, ext) {
        return base() + '/movie/' + encodeURIComponent(P.username) + '/' + encodeURIComponent(P.password) + '/' + id + '.' + (ext || 'mp4');
    }

    function episodeUrl(ep) {
        return base() + '/series/' + encodeURIComponent(P.username) + '/' + encodeURIComponent(P.password) + '/' + ep.id + '.' + (ep.container || 'mp4');
    }

    function catchupUrl(id, startTs, endTs, ext) {
        var now = Math.floor(Date.now() / 1000);
        return base() + '/live/' + encodeURIComponent(P.username) + '/' + encodeURIComponent(P.password) + '/' + id + '.' + (ext || 'm3u8') +
            '?utc=' + startTs + '&lutc=' + now;
    }

    function epgUrl() {
        return base() + '/xmltv.php?' + creds();
    }

    XTV.xtream = {
        init: init, auth: auth, info: info, api: api,
        catalog: catalog,
        vodInfo: vodInfo, seriesInfo: seriesInfo,
        shortEpg: shortEpg,
        liveUrl: liveUrl, movieUrl: movieUrl, episodeUrl: episodeUrl,
        catchupUrl: catchupUrl, epgUrl: epgUrl,
        isAdult: isAdult,
        active: function () { return !!P; },
        profile: function () { return P; }
    };
})();
