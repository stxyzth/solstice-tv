/* Solstice TV — detail pages for Movies and Series (TMDB-enriched). */
(function () {
    'use strict';
    var U = XTV.util;

    function heroBlock(kind, item, meta) {
        var el = U.el('div', 'detail-hero');
        var backdrop = (meta && (meta.backdropBig || meta.backdrop)) || item.icon || '';
        el.innerHTML =
            '<div class="detail-bg"><img src="' + U.esc(backdrop) + '" onerror="this.style.opacity=0"></div>' +
            '<div class="detail-fade"></div>' +
            '<div class="detail-content">' +
            '  <img class="detail-poster" src="' + U.esc((meta && meta.poster) || item.icon || '') + '" onerror="this.src=\'' + U.placeholder(item.name, 'poster').replace(/'/g, '%27') + '\'">' +
            '  <div class="detail-main">' +
            '    <h1 class="detail-title">' + U.esc((meta && meta.title) || item.name) + '</h1>' +
            '    <div class="detail-badges" id="detail-badges"></div>' +
            '    <p class="detail-overview">' + U.esc((meta && meta.overview) || item.plot || 'Loading details…') + '</p>' +
            '    <div class="detail-buttons"></div>' +
            '  </div>' +
            '</div>';
        var badges = [];
        if (meta && meta.year) badges.push(meta.year);
        else if (item.year) badges.push(item.year);
        if (meta && meta.runtime) badges.push(meta.runtime + ' min');
        if (meta && meta.genres && meta.genres.length) badges.push(meta.genres.slice(0, 3).join(' • '));
        if (meta && meta.rating) badges.push('<span class="badge-rate">★ ' + meta.rating + '</span>');
        var bEl = el.querySelector('#detail-badges');
        badges.forEach(function (b) {
            var s = U.el('span', 'badge', b);
            bEl.appendChild(s);
        });
        // OMDb ratings loaded async
        if (XTV.store.settings().omdbKey) {
            XTV.meta.imdbRatings(item.name, item.year || (meta && meta.year)).then(function (r) {
                if (!r || !el.isConnected) return;
                if (r.imdb) { var s1 = U.el('span', 'badge badge-imdb', 'IMDb ' + r.imdb); bEl.appendChild(s1); }
                if (r.rt) { var s2 = U.el('span', 'badge badge-rt', '🍅 ' + r.rt); bEl.appendChild(s2); }
                if (r.mc && r.mc !== 'N/A') { var s3 = U.el('span', 'badge', 'MC ' + r.mc); bEl.appendChild(s3); }
            });
        }
        return el;
    }

    function detailButton(label, primary, cb) {
        var b = U.el('div', 'btn' + (primary ? ' btn-primary' : ''), label);
        b.setAttribute('data-x', '');
        b.addEventListener('xfselect', cb);
        return b;
    }

    /* ---------------- movie ---------------- */
    function movie(params) {
        var item = params.item;
        var root = U.el('div', 'screen detail-screen');
        root.appendChild(heroBlock('movie', item, null));
        var btns = root.querySelector('.detail-buttons');

        function refreshButtons(meta) {
            btns.innerHTML = '';
            var prog = XTV.store.getProgress('movie', item.id) || {};
            var resumeAt = (prog.pos > 30 && prog.dur && prog.pos / prog.dur < 0.95) ? prog.pos : 0;
            btns.appendChild(detailButton(resumeAt ? '▶ Resume ' + U.fmtTime(resumeAt) : '▶ Play', true, function () {
                XTV.app.playMovie(item, resumeAt);
            }));
            var fav = XTV.store.isFav('movie', item.id);
            btns.appendChild(detailButton(fav ? '♥ Favorited' : '♡ Favorite', false, function () {
                var now = XTV.store.toggleFav('movie', item.id, { title: item.name, icon: item.icon });
                refreshButtons(meta);
                XTV.ui.toast(now ? 'Added to favorites' : 'Removed from favorites');
            }));
            if (meta && meta.trailerYt) {
                btns.appendChild(detailButton('▶ Trailer', false, function () { trailerModal(meta.trailerYt); }));
            }
            XTV.store.pushHistory({ kind: 'movie', id: item.id, title: item.name, icon: item.icon });
        }
        refreshButtons(null);

        XTV.ui.spinner(true, 'Fetching details…');
        XTV.xtream.vodInfo(item.id).then(function (info) {
            Object.assign(item, {
                plot: info.plot || item.plot,
                year: info.year || item.year,
                container: info.container || item.container,
                youtube: info.youtube || ''
            });
            return XTV.meta.movieDetail(item).then(function (meta) {
                XTV.ui.spinner(false);
                var merged = meta || {
                    title: item.name,
                    poster: item.icon,
                    backdropBig: item.icon,
                    overview: info.plot || '',
                    year: info.year || '',
                    rating: info.rating || 0,
                    runtime: 0,
                    genres: (info.genre || '').split(',').filter(Boolean),
                    cast: [],
                    similar: []
                };
                if (!merged.runtime && info.duration) {
                    var dm = String(info.duration).match(/(\d+)/);
                    if (dm) merged.runtime = parseInt(dm[1], 10);
                }
                if (!merged.cast.length && info.cast) {
                    merged.cast = String(info.cast).split(',').slice(0, 8).map(function (n) {
                        return { name: n.trim(), role: '', photo: U.placeholder(n.trim(), 'wide') };
                    });
                }
                var hero = root.querySelector('.detail-hero');
                if (hero) hero.parentElement.replaceChild(heroBlock('movie', item, merged), hero);
                btns = root.querySelector('.detail-buttons');
                refreshButtons(merged);
                appendCastAndSimilar(root, merged, function (title) {
                    var c = XTV.meta.cleanTitle(title).title.toLowerCase();
                    var hit = (XTV.app.catalog.vod || []).find(function (x) {
                        return XTV.meta.cleanTitle(x.name).title.toLowerCase() === c;
                    });
                    if (hit) XTV.app.openMovieDetail(hit);
                    else XTV.ui.toast('"' + title + '" is not in this playlist');
                });
            });
        }).catch(function () {
            XTV.ui.spinner(false);
        });

        root.addEventListener('xfocus', U.debounce(function (e) {
            var card = e.detail.el.closest ? e.detail.el.closest('.card') : null;
            if (card && card._item) XTV.app.ambient(card._item.icon);
        }, 300));
        return root;
    }

    function trailerModal(ytId) {
        var m = XTV.ui.modal({
            title: 'Trailer',
            cls: 'modal-trailer',
            body: '<iframe width="100%" height="100%" src="https://www.youtube.com/embed/' + U.esc(ytId) +
                '?autoplay=1&rel=0" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>',
            buttons: [{ label: 'Close', primary: true, onSelect: function (c) { c(); } }]
        });
        return m;
    }

    function appendCastAndSimilar(root, meta, openSimilar) {
        var wrap = U.el('div', 'detail-rows');
        root.appendChild(wrap);
        if (meta.cast && meta.cast.length) {
            wrap.appendChild(XTV.ui.buildRow({
                title: 'Cast & Crew',
                items: meta.cast.map(function (c) { return { title: c.name, sub: c.role, icon: c.photo }; }),
                kind: 'square',
                cardFn: function (it) { return XTV.ui.cardEl(it, 'square'); }
            }));
        }
        if (meta.similar && meta.similar.length) {
            wrap.appendChild(XTV.ui.buildRow({
                title: 'More Like This',
                items: meta.similar,
                onSelect: function (it) { openSimilar(it.title); }
            }));
        }
    }

    /* ---------------- series ---------------- */
    function series(params) {
        var item = params.item;
        var root = U.el('div', 'screen detail-screen');
        root.appendChild(heroBlock('series', item, null));
        var btns = root.querySelector('.detail-buttons');

        var seasonSel = null, epListEl = null;
        var seriesInfo = null;
        var curSeason = null;

        function refreshButtons() {
            btns.innerHTML = '';
            var fav = XTV.store.isFav('series', item.id);
            btns.appendChild(detailButton('▶ Play Next Unwatched', true, function () {
                var target = findNextEpisode();
                if (target) XTV.app.playEpisode(item, target.season, target.ep, target.resume);
                else XTV.ui.toast('No episodes loaded yet');
            }));
            btns.appendChild(detailButton(fav ? '♥ Favorited' : '♡ Favorite', false, function () {
                var now = XTV.store.toggleFav('series', item.id, { title: item.name, icon: item.icon });
                refreshButtons();
                XTV.ui.toast(now ? 'Added to favorites' : 'Removed from favorites');
            }));
            if (item._meta && item._meta.trailerYt) {
                btns.appendChild(detailButton('▶ Trailer', false, function () { trailerModal(item._meta.trailerYt); }));
            }
        }
        refreshButtons();

        var below = U.el('div', 'detail-below');
        root.appendChild(below);
        seasonSel = U.el('div', 'season-row x-scroll x-center-x');
        below.appendChild(seasonSel);
        epListEl = U.el('div', 'ep-list x-scroll');
        below.appendChild(epListEl);

        function findNextEpisode() {
            if (!seriesInfo) return null;
            var seasons = Object.keys(seriesInfo.episodes).map(Number).sort(function (a, b) { return a - b; });
            for (var i = 0; i < seasons.length; i++) {
                var eps = seriesInfo.episodes[seasons[i]];
                for (var j = 0; j < eps.length; j++) {
                    if (!XTV.store.isWatched(item.id, seasons[i], eps[j].episode)) {
                        var prog = XTV.store.getProgress('ep', eps[j].id, seasons[i], eps[j].episode);
                        return { season: seasons[i], ep: eps[j], resume: prog ? prog.pos : 0 };
                    }
                }
            }
            return null;
        }

        function renderSeasons() {
            seasonSel.innerHTML = '';
            (seriesInfo.seasons || []).forEach(function (s) {
                var el = U.el('div', 'chip2' + (curSeason === s.season ? ' on' : ''), U.esc(s.name || ('Season ' + s.season)));
                el.setAttribute('data-x', '');
                el._season = s.season;
                seasonSel.appendChild(el);
            });
        }

        function renderEpisodes() {
            var eps = (seriesInfo.episodes[curSeason] || []);
            var prog = XTV.store.seasonProgress(item.id, curSeason, eps);
            epListEl.innerHTML = '<div class="ep-list-head">' + prog.watched + ' of ' + prog.total + ' watched</div>';
            eps.forEach(function (ep) {
                var p = XTV.store.getProgress('ep', ep.id, curSeason, ep.episode) || {};
                var watched = XTV.store.isWatched(item.id, curSeason, ep.episode);
                var pct = p.dur ? Math.round(p.pos / p.dur * 100) : 0;
                var row = U.el('div', 'ep-item' + (watched ? ' watched' : ''));
                row.setAttribute('data-x', '');
                row.innerHTML =
                    '<div class="ep-num">' + ep.episode + '</div>' +
                    '<img class="ep-still" src="' + U.esc(ep.icon || U.placeholder(ep.name, 'wide')) + '" onerror="this.src=\'' + U.placeholder(ep.name, 'wide').replace(/'/g, '%27') + '\'">' +
                    '<div class="ep-info">' +
                    '  <div class="ep-title">' + U.esc(ep.name) + (watched ? ' <span class="ep-check">✓</span>' : '') + '</div>' +
                    '  <div class="ep-plot">' + U.esc((ep.plot || '').slice(0, 160)) + '</div>' +
                    '  <div class="ep-meta">' + (ep.duration ? U.fmtTime(ep.duration) : '') + '</div>' +
                    (pct ? '<div class="ep-progress">' + XTV.ui.playBadgeHtml(pct) + '</div>' : '') +
                    '</div>';
                row._ep = ep;
                epListEl.appendChild(row);
            });
        }

        seasonSel.addEventListener('xfocus', function (e) {
            if (e.detail.el._season != null && e.detail.el._season !== curSeason) {
                curSeason = e.detail.el._season;
                U.$$('.chip2', seasonSel).forEach(function (el) {
                    el.classList.toggle('on', el._season === curSeason);
                });
                renderEpisodes();
            }
        });
        seasonSel.addEventListener('xfselect', function (e) {
            curSeason = e.detail.el._season;
            renderSeasons(); renderEpisodes();
            XTV.focus.setFocused(e.detail.el);
        });
        epListEl.addEventListener('xfselect', function (e) {
            var row = e.detail.el.closest('.ep-item');
            if (row) {
                var ep = row._ep;
                var pr = XTV.store.getProgress('ep', ep.id, curSeason, ep.episode);
                var resume = (pr && pr.dur && pr.pos > 30 && pr.pos / pr.dur < XTV.store.settings().markWatchedPct / 100) ? pr.pos : 0;
                XTV.app.playEpisode(item, curSeason, ep, resume);
            }
        });

        XTV.ui.spinner(true, 'Loading series…');
        Promise.all([
            XTV.xtream.seriesInfo(item.id),
            XTV.meta.seriesDetail(item)
        ]).then(function (res) {
            XTV.ui.spinner(false);
            seriesInfo = res[0];
            item._seriesInfo = seriesInfo;
            var meta = res[1];
            if (meta) {
                item._meta = meta;
                var hero = root.querySelector('.detail-hero');
                var merged = meta;
                if (!merged.overview && item.plot) merged.overview = item.plot;
                var nh = heroBlock('series', item, merged);
                if (hero) hero.parentElement.replaceChild(nh, hero);
                btns = root.querySelector('.detail-buttons');
            } else if (item.plot) {
                root.querySelector('.detail-overview').textContent = item.plot;
            }
            refreshButtons();
            renderSeasons();
            // start on season of next unwatched episode
            var nx = findNextEpisode();
            curSeason = nx ? nx.season : ((seriesInfo.seasons[0] || {}).season || 1);
            renderEpisodes();
            appendCastAndSimilar(below, meta || { cast: [], similar: [] }, function (title) {
                var c = XTV.meta.cleanTitle(title).title.toLowerCase();
                var hit = (XTV.app.catalog.series || []).find(function (x) {
                    return XTV.meta.cleanTitle(x.name).title.toLowerCase() === c;
                });
                if (hit) XTV.app.openSeriesDetail(hit);
                else XTV.ui.toast('"' + title + '" is not in this playlist');
            });
            XTV.store.pushHistory({ kind: 'series', id: item.id, title: item.name, icon: item.icon });
        }).catch(function (e) {
            XTV.ui.spinner(false);
            XTV.ui.toast('Failed to load series info');
        });

        root.addEventListener('xfocus', U.debounce(function (e) {
            var card = e.detail.el.closest ? e.detail.el.closest('.card') : null;
            if (card && card._item) XTV.app.ambient(card._item.icon);
        }, 300));
        return root;
    }

    XTV.screens = XTV.screens || {};
    XTV.screens.movieDetail = { build: movie };
    XTV.screens.seriesDetail = { build: series };
})();
