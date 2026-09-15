/* Solstice TV — Home: hero + curated rows (Apple TV style). */
(function () {
    'use strict';
    var U = XTV.util;

    function movieCard(item, extra) {
        var card = XTV.ui.cardEl(Object.assign({}, item, extra || {}), 'poster');
        return card;
    }

    function openOrMatch(title, kind) {
        // open a provider item matching a metadata title, if present
        var list = kind === 'series' ? XTV.app.catalog.series : XTV.app.catalog.vod;
        var c = XTV.meta.cleanTitle(title).title.toLowerCase();
        var hit = list.find(function (x) { return XTV.meta.cleanTitle(x.name).title.toLowerCase() === c; });
        if (hit) {
            if (kind === 'series') XTV.app.openSeriesDetail(hit);
            else XTV.app.openMovieDetail(hit);
        } else XTV.ui.toast('"' + title + '" is not in this playlist');
    }

    function build() {
        var root = U.el('div', 'screen home-screen');
        var cat = XTV.app.catalog;
        var cw = XTV.store.continueWatching();
        var favM = Object.keys(XTV.store.favMap('movie'));
        var favS = Object.keys(XTV.store.favMap('series'));
        var favL = Object.keys(XTV.store.favMap('live'));
        var recent = (cat.vod || []).slice().sort(function (a, b) { return b.added - a.added; }).slice(0, 40);
        var recentS = (cat.series || []).slice().sort(function (a, b) { return b.added - a.added; }).slice(0, 40);
        var watchedLive = [];
        var seen = {};
        XTV.store.history().forEach(function (h) {
            if (h.kind === 'live' && !seen[h.id]) { seen[h.id] = 1; watchedLive.push(h); }
        });
        var liveById = {};
        (cat.live || []).forEach(function (c) { liveById[c.id] = c; });

        /* ---------- hero ---------- */
        var heroItem = cw.length ? cw[0] : null;
        var hero = U.el('div', 'hero');
        var heroMeta = heroItem ? heroItem.meta : (recent[0] ? {
            title: recent[0].name, icon: recent[0].icon, kindLabel: 'Recently added',
            kind: 'movie', id: recent[0].id, backdrop: recent[0].icon
        } : null);
        hero.innerHTML =
            '<div class="hero-bg"><img id="hero-bg-img" src="' + U.esc((heroMeta && (heroMeta.backdrop || heroMeta.icon)) || '') + '" alt=""></div>' +
            '<div class="hero-fade"></div>' +
            '<div class="hero-content">' +
            '  <div class="hero-kind">' + U.esc((heroMeta && heroMeta.kindLabel) || 'Featured') + '</div>' +
            '  <h1 class="hero-title">' + U.esc((heroMeta && heroMeta.title) || (cat.vod && cat.vod.length ? 'Your library is ready' : 'Welcome')) + '</h1>' +
            '  <div class="hero-meta"></div>' +
            '  <div class="hero-buttons"></div>' +
            '</div>';
        root.appendChild(hero);

        var heroButtons = hero.querySelector('.hero-buttons');
        function heroBtn(label, primary, cb) {
            var b = U.el('div', 'btn' + (primary ? ' btn-primary' : '') + ' btn-hero', label);
            b.setAttribute('data-x', '');
            b.addEventListener('xfselect', cb);
            heroButtons.appendChild(b);
            return b;
        }

        if (heroItem && heroItem.meta) {
            var hm = heroItem.meta;
            var frac = heroItem.dur ? Math.round(heroItem.pos / heroItem.dur * 100) : 0;
            hero.querySelector('.hero-meta').innerHTML =
                '<span>' + U.fmtTime(heroItem.dur - heroItem.pos) + ' left</span>' +
                (hm.seriesId != null ? '<span>S' + hm.season + ' E' + hm.ep + '</span>' : '') +
                '<span class="hero-progress">' + XTV.ui.playBadgeHtml(frac) + '</span>';
            var isEp = heroItem.kind === 'ep';
            heroBtn('▶ Resume', true, function () {
                if (isEp && hm.seriesId != null) {
                    var s = (cat.series || []).find(function (x) { return String(x.id) === String(hm.seriesId); });
                    if (s) XTV.app.playEpisodeAt(s, hm.season, hm.ep, heroItem.pos);
                } else {
                    var m = (cat.vod || []).find(function (x) { return String(x.id) === String(hm.id); });
                    if (m) XTV.app.playMovie(m, heroItem.pos);
                }
            });
            heroBtn('Details', false, function () {
                if (isEp && hm.seriesId != null) {
                    var s2 = (cat.series || []).find(function (x) { return String(x.id) === String(hm.seriesId); });
                    if (s2) XTV.app.openSeriesDetail(s2);
                } else {
                    var m2 = (cat.vod || []).find(function (x) { return String(x.id) === String(hm.id); });
                    if (m2) XTV.app.openMovieDetail(m2);
                }
            });
        } else if (recent[0]) {
            var r0 = recent[0];
            heroBtn('▶ Play', true, function () { XTV.app.playMovie(r0, 0); });
            heroBtn('Details', false, function () { XTV.app.openMovieDetail(r0); });
            // upgrade backdrop with TMDB art
            XTV.meta.movieDetail(r0).then(function (d) {
                if (d && d.backdropBig) {
                    var img = root.querySelector('#hero-bg-img');
                    if (img) img.src = d.backdropBig;
                }
            });
        } else {
            hero.querySelector('.hero-meta').textContent = 'Add a playlist to get started';
        }

        /* ---------- rows ---------- */
        var rowsWrap = U.el('div', 'home-rows');
        root.appendChild(rowsWrap);

        function addRow(opts) {
            if (!opts.items || !opts.items.length) return;
            rowsWrap.appendChild(XTV.ui.buildRow(opts));
        }

        // Continue watching
        addRow({
            title: 'Continue Watching',
            items: cw.map(function (p) {
                return {
                    id: p.id, title: p.meta.title, sub: p.meta.sub || (p.meta.kindLabel || ''),
                    icon: p.meta.icon, kind: p.kind, progress: p.dur ? Math.round(p.pos / p.dur * 100) : 0,
                    _prog: p
                };
            }),
            kind: 'wide',
            onSelect: function (it) {
                if (it.kind === 'ep') {
                    var s = (cat.series || []).find(function (x) { return String(x.id) === String(it._prog.meta.seriesId); });
                    if (s) XTV.app.playEpisodeAt(s, it._prog.season, it._prog.ep, it._prog.pos);
                } else {
                    var m = (cat.vod || []).find(function (x) { return String(x.id) === String(it.id); });
                    if (m) XTV.app.playMovie(m, it._prog.pos);
                }
            }
        });

        // Live: recently watched channels + favorites
        var liveCards = watchedLive.slice(0, 12).map(function (h) { return h; }).filter(function (h) { return liveById[h.id]; });
        var favChannels = favL.map(function (id) { return liveById[id]; }).filter(Boolean);
        addRow({
            title: 'Live TV — Recently Watched',
            items: liveCards.map(function (h) { return { id: h.id, title: h.title, icon: h.icon, num: (liveById[h.id] || {}).num }; }),
            kind: 'channel',
            onSelect: function (it) {
                var ch = liveById[it.id];
                if (ch) XTV.app.playLive(ch);
            }
        });
        addRow({
            title: 'Favorite Channels',
            items: favChannels.map(function (c) { return { id: c.id, title: c.name, icon: c.icon, num: c.num }; }),
            kind: 'channel',
            onSelect: function (it) { XTV.app.playLive(liveById[it.id]); }
        });

        // Recently watched (history + progress, incl. fully watched) — series then movies
        addRow({
            title: 'Recently Watched Series',
            items: XTV.store.recentlyWatchedSeries().map(function (r) {
                var s = (cat.series || []).find(function (x) { return String(x.id) === String(r.seriesId); });
                if (!s) return null;
                var sub = r.season != null ? 'S' + r.season + ' E' + r.ep : '';
                return { id: s.id, title: s.name, icon: s.icon, sub: sub, progress: Math.round(r.frac * 100), _series: s };
            }).filter(Boolean),
            onSelect: function (it) { XTV.app.openSeriesDetail(it._series); }
        });
        addRow({
            title: 'Recently Watched Movies',
            items: XTV.store.recentlyWatchedMovies().map(function (r) {
                var m = (cat.vod || []).find(function (x) { return String(x.id) === String(r.id); });
                if (!m) return null;
                var frac = r.frac || 0;
                var sub = frac >= 0.98 ? 'Watched' : (r.pos > 30 && r.dur ? U.fmtTime(r.dur - r.pos) + ' left' : '');
                return { id: m.id, title: m.name, icon: m.icon, sub: sub, progress: Math.round(frac * 100), _item: m };
            }).filter(Boolean),
            onSelect: function (it) { XTV.app.openMovieDetail(it._item); }
        });

        // Favorites movies/series
        addRow({
            title: 'Favorite Movies',
            items: favM.map(function (id) {
                return (cat.vod || []).find(function (x) { return x.id === id; });
            }).filter(Boolean),
            onSelect: function (it) { XTV.app.openMovieDetail(it); }
        });
        addRow({
            title: 'Favorite Series',
            items: favS.map(function (id) {
                return (cat.series || []).find(function (x) { return x.id === id; });
            }).filter(Boolean),
            onSelect: function (it) { XTV.app.openSeriesDetail(it); }
        });

        // Recently added
        addRow({
            title: 'Recently Added Movies',
            items: recent,
            onSelect: function (it) { XTV.app.openMovieDetail(it); }
        });
        addRow({
            title: 'Recently Added Series',
            items: recentS,
            onSelect: function (it) { XTV.app.openSeriesDetail(it); }
        });

        // Recommended: TMDB similar of last watched movie
        var lastMovie = cw.find(function (p) { return p.kind === 'movie'; });
        if (lastMovie && XTV.meta.enabled()) {
            var rowEl = XTV.ui.buildRow({ title: 'Recommended For You', items: [], onSelect: function (it) { openOrMatch(it.title, 'movie'); } });
            rowsWrap.appendChild(rowEl);
            var sc = rowEl._scroller;
            (cat.vod || []).find(function (x) { return String(x.id) === String(lastMovie.id); }) &&
                XTV.meta.movieDetail({ name: lastMovie.meta.title }).then(function (d) {
                    if (!d || !d.similar) return;
                    d.similar.slice(0, 14).forEach(function (s) {
                        var card = XTV.ui.cardEl({ title: s.title, sub: s.year, icon: s.poster }, 'poster');
                        card._item = s;
                        sc.appendChild(card);
                    });
                });
        }

        // TMDB Trending (matched against provider catalog)
        if (XTV.meta.enabled()) {
            var trendRow = XTV.ui.buildRow({ title: 'Trending Now', items: [], onSelect: function (it) { openOrMatch(it.title, it._kind || 'movie'); } });
            rowsWrap.appendChild(trendRow);
            var tsc = trendRow._scroller;
            XTV.meta.trending().then(function (list) {
                if (!list || !list.length) { trendRow.style.display = 'none'; return; }
                var vodNames = {};
                (cat.vod || []).forEach(function (v) { vodNames[XTV.meta.cleanTitle(v.name).title.toLowerCase()] = 'movie'; });
                (cat.series || []).forEach(function (s) { vodNames[XTV.meta.cleanTitle(s.name).title.toLowerCase()] = 'series'; });
                var shown = 0;
                list.forEach(function (t) {
                    if (shown >= 18) return;
                    var k = XTV.meta.cleanTitle(t.title).title.toLowerCase();
                    var kind = vodNames[k];
                    if (!kind) return;
                    var card = XTV.ui.cardEl({ title: t.title, sub: t.year, icon: t.poster }, 'poster');
                    card._item = { title: t.title, _kind: kind };
                    tsc.appendChild(card);
                    shown++;
                });
                if (!shown) trendRow.style.display = 'none';
            });
        }

        // provider status chips
        var status = U.el('div', 'home-status');
        var info = XTV.app.demo ? null : (XTV.xtream.info() || {});
        var ui = (info && info.user_info) || {};
        var prof = XTV.store.activeProfile();
        var exp = ui.exp_date ? new Date(parseInt(ui.exp_date, 10) * 1000) : null;
        status.innerHTML =
            '<span class="chip">' + U.esc(XTV.app.demo ? 'Demo Mode' : (prof ? prof.name : 'No profile')) + '</span>' +
            '<span class="chip">' + (cat.live || []).length + ' channels</span>' +
            '<span class="chip">' + (cat.vod || []).length + ' movies</span>' +
            '<span class="chip">' + (cat.series || []).length + ' series</span>' +
            (exp ? '<span class="chip' + (exp.getTime() < Date.now() ? ' chip-warn' : '') + '">Plan until ' + U.fmtDate(exp) + '</span>' : '') +
            (ui.active_cons ? '<span class="chip">Connections ' + ui.active_cons + '/' + (ui.max_connections || '?') + '</span>' : '');
        root.appendChild(status);

        // multiview launcher
        var mv = U.el('div', 'multiview-launch');
        var mvBtn = U.el('div', 'btn', '▦ Multi-View — watch up to 4 channels');
        mvBtn.setAttribute('data-x', '');
        mvBtn.addEventListener('xfselect', function () { XTV.app.showMultiview(); });
        mv.appendChild(mvBtn);
        root.appendChild(mv);

        // ambient
        root.addEventListener('xfocus', U.debounce(function (e) {
            var card = e.detail.el.closest ? e.detail.el.closest('.card') : null;
            if (card && card._item && (card._item.icon)) XTV.app.ambient(card._item.icon);
            else XTV.app.ambient('');
        }, 350));

        return root;
    }

    XTV.screens = XTV.screens || {};
    XTV.screens.home = { build: build };
})();
