/* Solstice TV — metadata enrichment via TMDB (artwork/cast/similar) + OMDb (IMDb/RT/MC ratings).
   Both keys are optional; everything degrades gracefully to provider artwork. */
(function () {
    'use strict';
    var U = XTV.util;
    var IMG = 'https://image.tmdb.org/t/p/';

    function enabled() { return !!XTV.store.settings().tmdbKey; }

    function api(path, params, ttl) {
        var s = XTV.store.settings();
        params = Object.assign({}, params);
        params.api_key = s.tmdbKey;
        var url = 'https://api.themoviedb.org/3' + path + '?' + U.qs(params);
        var key = 'tmdb:' + path + '?' + U.qs(params);
        return XTV.idb.get(key).then(function (cached) {
            if (cached) return cached;
            return new Promise(function (resolve) {
                XTV.net.getJSON(url, 12000, function (err, json) {
                    if (err || !json) return resolve(null);
                    XTV.idb.set(key, json, ttl || 7 * 24 * 3600 * 1000);
                    resolve(json);
                });
            });
        });
    }

    /* --- title cleaning: providers often embed quality tags and years --- */
    function cleanTitle(raw) {
        var t = String(raw || '');
        var year = '';
        var ym = t.match(/[\(\[]((19|20)\d{2})[\)\]]/);
        if (ym) { year = ym[1]; t = t.replace(ym[0], ' '); }
        t = t.replace(/[\(\[]?\s*(2160|1080|720|480)p?\s*(k|x|h)?\d*\s*[\)\]]?/gi, ' ');
        t = t.replace(/\b(bluray|blu-ray|brrip|bdrip|web-?dl|webrip|hdtv|dvdrip|hdrip|camrip|x264|x265|h\.?264|h\.?265|hevc|aac|aac2|dts|ac3|ddp?5\.1|eac3|10bit|8bit|hdr10?|dv|remux|proper|repack|extended|unrated|multi|dual-?audio|subbed|dubbed)\b/gi, ' ');
        t = t.replace(/\s*[-–—_]\s*$/g, ' ');
        t = t.replace(/\s{2,}/g, ' ').trim();
        return { title: t, year: year };
    }

    function pickYear(item) {
        return (item && (item.year || (item.release ? String(item.release).match(/\d{4}/) : [''])[0])) || '';
    }

    /* --- movie matching + detail --- */
    function findMovie(name, year) {
        if (!enabled()) return Promise.resolve(null);
        var c = cleanTitle(name);
        var key = 'tmdb:match:m:' + c.title.toLowerCase() + ':' + (year || c.year);
        return XTV.idb.get(key).then(function (hit) {
            if (hit !== undefined) return hit;
            return api('/search/movie', { query: c.title, year: year || c.year || undefined }, 30 * 24 * 3600 * 1000)
                .then(function (r) {
                    var best = null;
                    if (r && r.results && r.results.length) best = r.results[0];
                    XTV.idb.set(key, best, 30 * 24 * 3600 * 1000);
                    return best;
                });
        });
    }

    function findSeries(name, year) {
        if (!enabled()) return Promise.resolve(null);
        var c = cleanTitle(name);
        var key = 'tmdb:match:s:' + c.title.toLowerCase() + ':' + (year || c.year);
        return XTV.idb.get(key).then(function (hit) {
            if (hit !== undefined) return hit;
            return api('/search/tv', { query: c.title, first_air_date_year: year || c.year || undefined }, 30 * 24 * 3600 * 1000)
                .then(function (r) {
                    var best = null;
                    if (r && r.results && r.results.length) best = r.results[0];
                    XTV.idb.set(key, best, 30 * 24 * 3600 * 1000);
                    return best;
                });
        });
    }

    function castList(credits, n) {
        var cast = (credits && credits.cast) || [];
        return cast.slice(0, n || 8).map(function (p) {
            return {
                name: p.name,
                role: p.character || '',
                photo: p.profile_path ? IMG + 'w185' + p.profile_path : U.placeholder(p.name, 'wide')
            };
        });
    }

    function similarList(sim, n) {
        var arr = (sim && sim.results) || [];
        return arr.slice(0, n || 12).map(function (m) {
            return {
                title: m.title || m.name,
                year: String((m.release_date || m.first_air_date || '')).slice(0, 4),
                poster: m.poster_path ? IMG + 'w342' + m.poster_path : U.placeholder(m.title || m.name || '?'),
                rating: m.vote_average || 0
            };
        });
    }

    function movieDetail(providerItem) {
        var name = providerItem.name;
        return findMovie(name, pickYear(providerItem)).then(function (hit) {
            if (!hit) return null;
            return api('/movie/' + hit.id, { append_to_response: 'credits,similar,videos,images,release_dates' })
                .then(function (d) {
                    if (!d) return null;
                    var logos = (d.images && (d.images.logos || [])) || [];
                    var logo = logos.length ? IMG + 'w500' + logos[0].file_path : '';
                    var vids = (d.videos && d.videos.results) || [];
                    var trailer = '';
                    for (var i = 0; i < vids.length; i++)
                        if (vids[i].site === 'YouTube' && (vids[i].type === 'Trailer' || vids[i].type === 'Teaser')) { trailer = vids[i].key; break; }
                    return {
                        tmdbId: d.id,
                        title: d.title || name,
                        overview: d.overview || '',
                        poster: d.poster_path ? IMG + 'w500' + d.poster_path : (providerItem.icon || ''),
                        backdrop: d.backdrop_path ? IMG + 'w1280' + d.backdrop_path : '',
                        backdropBig: d.backdrop_path ? IMG + 'original' + d.backdrop_path : '',
                        logo: logo,
                        year: String(d.release_date || '').slice(0, 4),
                        rating: Math.round((d.vote_average || 0) * 10) / 10,
                        runtime: d.runtime || 0,
                        genres: (d.genres || []).map(function (g) { return g.name; }),
                        cast: castList(d.credits),
                        similar: similarList(d.similar),
                        trailerYt: trailer
                    };
                });
        });
    }

    function seriesDetail(providerItem) {
        var name = providerItem.name;
        return findSeries(name, pickYear(providerItem)).then(function (hit) {
            if (!hit) return null;
            return api('/tv/' + hit.id, { append_to_response: 'credits,similar,videos,images' })
                .then(function (d) {
                    if (!d) return null;
                    var logos = (d.images && (d.images.logos || [])) || [];
                    var logo = logos.length ? IMG + 'w500' + logos[0].file_path : '';
                    var vids = (d.videos && d.videos.results) || [];
                    var trailer = '';
                    for (var i = 0; i < vids.length; i++)
                        if (vids[i].site === 'YouTube' && vids[i].type === 'Trailer') { trailer = vids[i].key; break; }
                    return {
                        tmdbId: d.id,
                        title: d.name || name,
                        overview: d.overview || '',
                        poster: d.poster_path ? IMG + 'w500' + d.poster_path : (providerItem.icon || ''),
                        backdrop: d.backdrop_path ? IMG + 'w1280' + (d.backdrop_path) : '',
                        backdropBig: d.backdrop_path ? IMG + 'original' + d.backdrop_path : '',
                        logo: logo,
                        year: String(d.first_air_date || '').slice(0, 4),
                        rating: Math.round((d.vote_average || 0) * 10) / 10,
                        runtime: (d.episode_run_time && d.episode_run_time[0]) || 0,
                        genres: (d.genres || []).map(function (g) { return g.name; }),
                        cast: castList(d.credits),
                        similar: similarList(d.similar),
                        trailerYt: trailer,
                        status: d.status || ''
                    };
                });
        });
    }

    function episodeStill(showTmdbId, season, episode) {
        if (!enabled() || !showTmdbId) return Promise.resolve('');
        return api('/tv/' + showTmdbId + '/season/' + season).then(function (d) {
            if (!d || !d.episodes) return '';
            for (var i = 0; i < d.episodes.length; i++) {
                if (d.episodes[i].episode_number === episode) {
                    return d.episodes[i].still_path ? IMG + 'w300' + d.episodes[i].still_path : '';
                }
            }
            return '';
        });
    }

    /* --- OMDb: real IMDb / Rotten Tomatoes / Metacritic ratings --- */
    function imdbRatings(title, year) {
        var key = XTV.store.settings().omdbKey;
        if (!key) return Promise.resolve(null);
        var c = cleanTitle(title);
        var ck = 'omdb:' + c.title.toLowerCase() + ':' + (year || '');
        return XTV.idb.get(ck).then(function (hit) {
            if (hit !== undefined) return hit;
            var url = 'https://www.omdbapi.com/?apikey=' + encodeURIComponent(key) + '&' + U.qs({ t: c.title, y: year || undefined });
            return new Promise(function (resolve) {
                XTV.net.getJSON(url, 10000, function (err, j) {
                    if (err || !j || j.Response === 'False') { XTV.idb.set(ck, null, 7 * 24 * 3600 * 1000); return resolve(null); }
                    var ratings = { imdb: j.imdbRating || '', imdbVotes: j.imdbVotes || '', rt: '', mc: j.Metascore || '' };
                    (j.Ratings || []).forEach(function (r) {
                        if (r.Source === 'Rotten Tomatoes') ratings.rt = r.Value;
                    });
                    XTV.idb.set(ck, ratings, 7 * 24 * 3600 * 1000);
                    resolve(ratings);
                });
            });
        });
    }

    function trending() {
        if (!enabled()) return Promise.resolve([]);
        return api('/trending/all/week', {}, 12 * 3600 * 1000).then(function (d) {
            if (!d || !d.results) return [];
            return d.results.map(function (r) {
                return {
                    title: r.title || r.name || '',
                    year: (r.release_date || r.first_air_date || '').slice(0, 4),
                    poster: r.poster_path ? IMG + 'w342' + r.poster_path : '',
                    kind: r.media_type === 'tv' ? 'series' : 'movie'
                };
            });
        });
    }

    XTV.meta = {
        enabled: enabled,
        cleanTitle: cleanTitle,
        movieDetail: movieDetail,
        seriesDetail: seriesDetail,
        episodeStill: episodeStill,
        imdbRatings: imdbRatings,
        trending: trending,
        IMG: IMG
    };
})();
