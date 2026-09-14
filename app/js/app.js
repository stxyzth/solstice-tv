/* Solstice TV — application shell: boot, tabs, router/back-stack, key routing,
   catalog state, ambient background. */
(function () {
    'use strict';
    var U = XTV.util;

    var TABS = [
        { id: 'home', label: 'Home' },
        { id: 'live', label: 'Live TV' },
        { id: 'movies', label: 'Movies' },
        { id: 'series', label: 'Series' },
        { id: 'search', label: 'Search' },
        { id: 'settings', label: 'Settings' }
    ];

    var app = {
        catalog: null,     // filtered catalog
        rawCatalog: null,
        demo: false,
        tab: 'home',
        navStack: [],      // [{id, params, el}]
        booted: false,
        log: []            // runtime error ring for Settings → Diagnostics
    };

    window.addEventListener('error', function (e) {
        var msg = String(e.message || e);
        if (e.filename) msg += ' @ ' + String(e.filename).split('/').slice(-2).join('/') + ':' + e.lineno;
        if (app.log.indexOf(msg) === -1 && app.log.length < 40) app.log.push(msg);
    });
    window.addEventListener('unhandledrejection', function (e) {
        var r = e && e.reason;
        var msg = 'Promise: ' + String(r && r.message || r).slice(0, 200);
        if (app.log.indexOf(msg) === -1 && app.log.length < 40) app.log.push(msg);
    });

    /* ---------------- DOM shell ---------------- */
    function buildShell() {
        document.body.innerHTML =
            '<div id="ambient"><img id="ambient-img" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></div>' +
            '<div id="app">' +
            '  <header id="tabbar">' +
            '    <nav id="tabs"></nav>' +
            '    <div id="profile-name"></div>' +
            '  </header>' +
            '  <main id="view"></main>' +
            '</div>';
        var tabs = U.byId('tabs');
        TABS.forEach(function (t) {
            var el = U.el('div', 'tab' + (t.id === app.tab ? ' on' : ''), t.label);
            el.setAttribute('data-x', '');
            el._tab = t.id;
            el.addEventListener('xfselect', function () { setTab(t.id); });
            tabs.appendChild(el);
        });
        var switching = null;
        tabs.addEventListener('xfocus', function (e) {
            var id = e.detail.el._tab;
            if (id && id !== app.tab) {
                clearTimeout(switching);
                switching = setTimeout(function () { switching = null; setTab(id, true); }, 260);
            }
        });
        app._cancelTabSwitch = function () { if (switching) { clearTimeout(switching); switching = null; } };
    }

    function renderTabbar() {
        U.$$('.tab', U.byId('tabs')).forEach(function (el) {
            el.classList.toggle('on', el._tab === app.tab);
        });
        var top = app.navStack[app.navStack.length - 1];
        var onLogin = top && top.id === 'login';
        U.byId('tabbar').style.display = onLogin ? 'none' : '';
        var p = XTV.store.activeProfile();
        U.byId('profile-name').textContent = (app.demo ? 'DEMO' : (p ? p.name : ''));
    }

    /* ---------------- router ---------------- */
    function mountTop(focusView) {
        var top = app.navStack[app.navStack.length - 1];
        var view = U.byId('view');
        if (top.el && top.el._onDestroy) { try { top.el._onDestroy(); } catch (e) {} }
        view.innerHTML = '';
        if (top.el) top.el.classList.add('x-scroll');
        view.appendChild(top.el);
        XTV.focus.setRoot(U.byId('app'), false);
        if (focusView !== false) {
            // land focus in the content, not on the tab bar
            var first = U.$('#view [data-x]');
            if (first) XTV.focus.setFocused(first);
        }
    }

    app.show = function (screenId, params) {
        if (XTV.screens.multiview.active()) XTV.screens.multiview.stop();
        var s = XTV.screens[screenId];
        if (!s) return;
        var el = s.build(params || {});
        app.navStack = [{ id: screenId, params: params || {}, el: el }];
        mountTop();
        renderTabbar();
    };

    app.push = function (screenId, params) {
        var s = XTV.screens[screenId];
        if (!s) return;
        var el = s.build(params || {});
        app.navStack.push({ id: screenId, params: params || {}, el: el });
        mountTop();
    };

    app.back = function () {
        if (XTV.screens.multiview.active()) {
            XTV.ui.confirm('Leave Multi-View?', 'All tiles will stop playing.', [
                { label: 'Stay', onSelect: function (c) { c(); } },
                { label: 'Leave', primary: true, onSelect: function (c) { c(); XTV.screens.multiview.stop(); app.refresh(); } }
            ]);
            return;
        }
        if (app.navStack.length > 1) {
            app.navStack.pop();
            mountTop();
        } else if (app.tab !== 'home') {
            setTab('home');
        } else {
            XTV.ui.toast('Press HOME on your remote to exit');
        }
    };

    function setTab(id, fromFocus) {
        if (XTV.screens.multiview.active()) XTV.screens.multiview.stop();
        if (app._cancelTabSwitch) app._cancelTabSwitch();
        app.tab = id;
        var s = XTV.screens[id];
        if (!s) return;
        // keep the D-pad focus on the activated tab instead of bouncing to the first one
        var cur = XTV.focus.current();
        var curTabId = cur && cur._tab ? cur._tab : null;
        var el = s.build({});
        app.navStack = [{ id: id, params: {}, el: el }];
        mountTop();
        if (curTabId) {
            var tEl = U.$$('.tab', U.byId('tabs')).filter(function (t) { return t._tab === curTabId; })[0];
            if (tEl) XTV.focus.setFocused(tEl, { silent: true });
        }
        renderTabbar();
    }
    app.setTab = setTab;
    app.refresh = function () { app.show(app.tab, {}); };
    app.reloadProfiles = function () {
        var p = XTV.store.activeProfile();
        if (!p) { app.show('login', {}); return; }
        if (app.demo) return;
        app.demo = false;
        XTV.xtream.init(p);
        startCatalog(true);
    };

    /* ---------------- catalog ---------------- */
    function applyFilters() {
        if (!app.rawCatalog) return;
        var s = XTV.store.settings();
        var hideAdult = s.hideAdult;
        var f = function (list) {
            if (!hideAdult) return list;
            var adultCats = {};
            (app.rawCatalog.liveCats || []).concat(app.rawCatalog.vodCats || [], app.rawCatalog.serCats || []).forEach(function (c) {
                if (XTV.xtream.isAdult(c.name)) adultCats[c.id] = 1;
            });
            return list.filter(function (x) { return !adultCats[x.catId]; });
        };
        app.catalog = {
            liveCats: app.rawCatalog.liveCats,
            live: f(app.rawCatalog.live),
            vodCats: app.rawCatalog.vodCats,
            vod: f(app.rawCatalog.vod),
            serCats: app.rawCatalog.serCats,
            series: f(app.rawCatalog.series)
        };
    }

    app.startCatalog = function (force) {
        XTV.ui.spinner(true, 'Loading your library…');
        XTV.xtream.catalog(force).then(function (cat) {
            app.rawCatalog = cat;
            applyFilters();
            XTV.ui.spinner(false);
            renderTabbar();
            setTab(app.tab || 'home');
            // full EPG in background
            XTV.epg.loadFull().then(function (g) {
                if (g) XTV.ui.toast('Full guide loaded (' + g.channelCount + ' channels)');
            });
        }).catch(function (err) {
            XTV.ui.spinner(false);
            XTV.ui.modal({
                title: 'Could not load library',
                cls: 'modal-narrow',
                body: '<p class="modal-text">' + U.esc(err.message || String(err)) + '</p>',
                buttons: [
                    { label: 'Retry', primary: true, onSelect: function (c) { c(); app.startCatalog(true); } },
                    { label: 'Manage profiles', onSelect: function (c) { c(); app.show('login', {}); } }
                ]
            });
        });
    };

    app.startDemo = function () {
        app.demo = true;
        XTV.demo.install();
        XTV.ui.toast('Demo mode — a fictional provider with test streams');
        XTV.xtream.catalog().then(function (cat) {
            app.rawCatalog = cat;
            applyFilters();
            renderTabbar();
            setTab('home');
        });
    };

    app.liveCategories = function () {
        return (app.catalog && app.catalog.liveCats) || [];
    };

    /* ---------------- playback helpers ---------------- */
    function historyEntry(kind, id, title, icon) {
        XTV.store.pushHistory({ kind: kind, id: id, title: title, sub: '', icon: icon });
    }

    app.playLive = function (ch, list, idx) {
        list = list || (app.catalog ? app.catalog.live : [ch]);
        if (idx == null) {
            idx = 0;
            for (var i = 0; i < list.length; i++) if (list[i].id === ch.id) { idx = i; break; }
        }
        historyEntry('live', ch.id, ch.name, ch.icon);
        XTV.player.play({
            kind: 'live', id: ch.id,
            url: XTV.xtream.liveUrl(ch.id, 'm3u8'),
            altUrl: XTV.xtream.liveUrl(ch.id, 'ts'),
            title: ch.name,
            sub: 'CH ' + (ch.num != null ? ch.num : ''),
            logo: ch.icon,
            channelList: list, channelIndex: idx,
            epgProvider: function (cb) {
                XTV.epg.nowNext(ch).then(function (nn) {
                    var html = '';
                    if (nn && nn.now) {
                        var pct = nn.now.stop > nn.now.start ? ((Date.now() - nn.now.start.getTime()) / (nn.now.stop - nn.now.start)) * 100 : 0;
                        html = '<div class="player-epg-now"><span class="player-epg-time">' + U.fmtClock(nn.now.start) + ' – ' + U.fmtClock(nn.now.stop) + '</span> ' + U.esc(nn.now.title) + '</div>' +
                            (nn.next ? '<div class="player-epg-next">Next: ' + U.fmtClock(nn.next.start) + ' ' + U.esc(nn.next.title) + '</div>' : '') +
                            '<div class="player-epg-line"><i style="width:' + U.clamp(pct, 0, 100) + '%"></i></div>';
                    } else html = '<div class="player-epg-now">No EPG data</div>';
                    cb(html);
                });
            }
        });
    };

    app.playCatchup = function (ch, program) {
        historyEntry('live', ch.id, ch.name, ch.icon);
        var start = Math.floor(program.start.getTime() / 1000);
        XTV.player.play({
            kind: 'live', id: ch.id,
            url: XTV.xtream.catchupUrl(ch.id, start, 0, 'm3u8'),
            altUrl: XTV.xtream.catchupUrl(ch.id, start, 0, 'ts'),
            title: ch.name + ' — Catch-up',
            sub: U.fmtClock(program.start) + ' ' + program.title,
            logo: ch.icon
        });
    };

    app.playMovie = function (item, startPos) {
        startPos = startPos || 0;
        historyEntry('movie', item.id, item.name, item.icon);
        XTV.player.play({
            kind: 'movie', id: item.id,
            url: XTV.xtream.movieUrl(item.id, item.container || 'mp4'),
            altUrl: XTV.xtream.movieUrl(item.id, (item.container || 'mp4') === 'mp4' ? 'mkv' : 'mp4'),
            title: item.name,
            sub: '',
            logo: item.icon,
            icon: item.icon,
            startPos: startPos,
            metaTitle: item.name,
            onProgressSaved: function () { if (app.tab === 'home') app.refresh(); }
        });
    };

    app.playEpisode = function (seriesItem, season, epItem, startPos) {
        startPos = startPos || 0;
        var info = seriesItem._seriesInfo;
        var eps = (info && info.episodes[season]) || [];
        var epIdx = -1;
        eps.forEach(function (e, i) { if (e.id === epItem.id) epIdx = i; });

        function buildOpts(ep, idx) {
            var nxt = (idx >= 0 && idx + 1 < eps.length) ? function () {
                return buildOpts(eps[idx + 1], idx + 1);
            } : null;
            return {
                kind: 'ep', id: ep.id, season: season, ep: ep.episode,
                seriesId: seriesItem.id,
                url: XTV.xtream.episodeUrl(ep),
                altUrl: null,
                title: seriesItem.name,
                sub: 'S' + season + ' E' + ep.episode + ' · ' + ep.name,
                logo: seriesItem.icon,
                icon: ep.icon || seriesItem.icon,
                startPos: idx === epIdx ? startPos : 0,
                metaTitle: seriesItem.name + ' S' + season + 'E' + ep.episode,
                onNext: nxt,
                onProgressSaved: function () { if (app.tab === 'home') app.refresh(); }
            };
        }

        historyEntry('ep', epItem.id, seriesItem.name + ' — S' + season + 'E' + epItem.episode, epItem.icon);
        XTV.store.markWatched(seriesItem.id, season, epItem.episode, false);
        XTV.player.play(buildOpts(epItem, epIdx));
    };

    app.playEpisodeAt = function (seriesItem, season, epNum, pos) {
        var info = seriesItem._seriesInfo;
        if (!info) {
            XTV.ui.spinner(true, 'Loading series…');
            XTV.xtream.seriesInfo(seriesItem.id).then(function (si) {
                XTV.ui.spinner(false);
                seriesItem._seriesInfo = si;
                var ep = (si.episodes[season] || []).find(function (e) { return e.episode === epNum; });
                if (ep) app.playEpisode(seriesItem, season, ep, pos);
            });
            return;
        }
        var ep2 = (info.episodes[season] || []).find(function (e) { return e.episode === epNum; });
        if (ep2) app.playEpisode(seriesItem, season, ep2, pos);
    };

    app.openMovieDetail = function (item) { app.push('movieDetail', { item: item }); };
    app.openSeriesDetail = function (item) { app.push('seriesDetail', { item: item }); };
    app.showMultiview = function () { app.push('multiview', {}); };

    /* ---------------- ambient background ---------------- */
    var ambientT = null;
    app.ambient = function (url) {
        var wrap = U.byId('ambient');
        if (!wrap) return;
        if (!XTV.store.settings().ambient || !url) {
            wrap.classList.remove('on');
            return;
        }
        clearTimeout(ambientT);
        ambientT = setTimeout(function () {
            var img = U.byId('ambient-img');
            var probe = new Image();
            probe.onload = function () {
                img.src = url;
                wrap.classList.add('on');
            };
            probe.src = url;
        }, 400);
    };

    app.applyAccent = function (color) {
        document.documentElement.style.setProperty('--accent', color || '#0a84ff');
    };

    /* ---------------- external settings (mobile companion) ---------------- */
    var REMOTE_KEYS = ['accent', 'ambient', 'preferNative', 'bufferSec', 'autoplayNext', 'markWatchedPct',
        'epgOffsetHours', 'fullEpg', 'hideAdult', 'subtitleLang', 'tmdbKey', 'omdbKey', 'osKey', 'displayClock', 'skipIntroSec'];

    app.applyExternalSettings = function (obj) {
        if (!obj) return 0;
        var n = 0, s = XTV.store.settings(), hideAdultChanged = false;
        REMOTE_KEYS.forEach(function (k) {
            if (obj[k] === undefined || obj[k] === s[k]) return;
            if (k === 'hideAdult') hideAdultChanged = true;
            XTV.store.setSetting(k, obj[k]);
            n++;
        });
        if (n) {
            app.applyAccent(s.accent);
            if (!s.ambient) app.ambient('');
            if (hideAdultChanged && !app.demo) app.reloadProfiles();
            else if (app.navStack.length && app.navStack[app.navStack.length - 1].id === 'settings') app.refresh();
        }
        return n;
    };

    /* ---------------- key routing ---------------- */
    var KEYMAP = {
        13: 'ok', 461: 'back', 8: 'back', 27: 'back',
        37: 'left', 38: 'up', 39: 'right', 40: 'down',
        403: 'red', 404: 'green', 405: 'yellow', 406: 'blue',
        415: 'play', 19: 'pause', 413: 'stop', 417: 'ff', 412: 'rw',
        427: 'chup', 428: 'chdown',
        32: 'playpause', 179: 'playpause',
        48: '0', 49: '1', 50: '2', 51: '3', 52: '4', 53: '5', 54: '6', 55: '7', 56: '8', 57: '9',
        96: '0', 97: '1', 98: '2', 99: '3', 100: '4', 101: '5', 102: '6', 103: '7', 104: '8', 105: '9'
    };

    function topModal() {
        return XTV.ui.topModal ? XTV.ui.topModal() : null;
    }

    function onKeyDown(e) {
        // native text entry: while a field is focused, the TV system keyboard
        // (or hardware keyboard) owns the keys — backspace edits, Back/Escape leaves
        var ae = document.activeElement;
        if (app.booted && ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
            if (e.keyCode === 461 || e.keyCode === 27) {
                try { ae.blur(); } catch (er) {}
                e.preventDefault();
            }
            return;
        }
        var key = KEYMAP[e.keyCode];
        if (!key) return;
        if (!app.booted) return;
        var handled = true;
        var modal = topModal();
        if (modal) {
            if (key === 'back') { modal.close(); }   // topModal() exposes close()
            else if (key === 'ok') { XTV.focus.select(); }
            else if (key === 'left' || key === 'right' || key === 'up' || key === 'down') { XTV.focus.move(key); }
            else handled = false;
        } else if (XTV.player.isActive()) {
            handled = XTV.player.onKey(key);
        } else if (XTV.screens.multiview.active()) {
            // multi-view grid handles its own D-pad
            if (key === 'back') { app.back(); }
            else {
                var mvEv = document.createEvent('CustomEvent');
                mvEv.initCustomEvent('xfkey', true, false, key);
                app.navStack[app.navStack.length - 1].el.dispatchEvent(mvEv);
            }
        } else if (key === 'back') {
            app.back();
        } else if (key === 'left' || key === 'right' || key === 'up' || key === 'down') {
            handled = XTV.focus.move(key);
        } else if (key === 'ok') {
            handled = XTV.focus.select();
        } else {
            // screen-level custom keys (colors, digits, media)
            var ev = document.createEvent('CustomEvent');
            ev.initCustomEvent('xfkey', true, false, key);
            var target = app.navStack.length && app.navStack[app.navStack.length - 1].el;
            if (target) target.dispatchEvent(ev);
            handled = ['red', 'green', 'yellow', 'blue', 'chup', 'chdown'].indexOf(key) !== -1 || (key >= '0' && key <= '9') ||
                ['play', 'pause', 'playpause', 'stop', 'ff', 'rw'].indexOf(key) !== -1;
        }
        if (handled) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    /* ---------------- boot ---------------- */
    function boot() {
        buildShell();
        app.applyAccent(XTV.store.settings().accent);
        window.addEventListener('keydown', onKeyDown, true);
        // keep webOS screensaver away while video plays (player toggles it too)
        var p = XTV.store.activeProfile();
        if (p && !app.demo) {
            XTV.xtream.init(p);
        }
        if (XTV.store.settings().pinEnabled && XTV.store.settings().pin) {
            showSplash('Solstice TV');
            XTV.ui.pinpad('Enter your PIN', function (val) {
                if (val === XTV.store.settings().pin) {
                    afterGate();
                } else {
                    XTV.ui.toast('Incorrect PIN');
                }
            });
        } else {
            afterGate();
        }
    }

    function afterGate() {
        var prof = XTV.store.activeProfile();
        if (prof) {
            showSplash('Connecting to ' + prof.name + '…');
            XTV.xtream.init(prof);
            XTV.xtream.auth().then(function () {
                app.booted = true;
                hideSplash();
                app.startCatalog(false);
            }).catch(function () {
                app.booted = true;
                hideSplash();
                app.show('login', {});
                XTV.ui.toast('Could not reach provider — check connection');
            });
        } else {
            app.booted = true;
            hideSplash();
            app.show('login', {});
        }
    }

    function showSplash(label) {
        var sp = U.el('div', 'splash', '<div class="splash-logo">▶</div><div class="splash-title">Solstice TV</div><div class="splash-label">' + U.esc(label || '') + '</div>');
        sp.id = 'splash';
        document.body.appendChild(sp);
    }
    function hideSplash() {
        var sp = U.byId('splash');
        if (sp) {
            sp.classList.add('off');
            setTimeout(function () { if (sp.parentElement) sp.parentElement.removeChild(sp); }, 350);
        }
    }

    // helpers used by screens
    app.showSplash = showSplash;
    app.hideSplash = hideSplash;

    document.addEventListener('DOMContentLoaded', boot);
    XTV.app = app;
})();
