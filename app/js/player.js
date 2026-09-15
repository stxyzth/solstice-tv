/* Solstice TV — playback engine.
   webOS platform rules: no Fullscreen API, never transform/clip the video
   container, reuse one <video> element, prefer the native media pipeline
   (hardware) with hls.js as fallback. */
(function () {
    'use strict';
    var U = XTV.util;

    var video = null, overlay = null, hls = null;
    var state = null;          // active play opts
    var controlsOn = false, zone = 'scrub', btnIdx = 0;
    var hideTimer = null, saveTimer = null, watchdog = null, infoTimer = null;
    var zapDigits = '', zapTimer = null;
    var retryExtDone = false, hlsFallbackDone = false;
    var lastInIntro = false;
    var mpegtsP = null;
    var nextCountdown = null;
    var wasStopped = true;
    var startedOnce = false;

    var BUTTONS = [];          // computed per state: [{icon,label,cb}]

    function nativeHls() {
        var v = video || document.createElement('video');
        return !!(v.canPlayType('application/vnd.apple.mpegurl') || '').length;
    }

    function isWebOS() {
        return !!(window.PalmSystem || window.webOS);
    }

    /* ---------------- overlay DOM (created once) ---------------- */
    function ensureDom() {
        if (overlay) return;
        overlay = U.el('div', 'player');
        overlay.id = 'player';
        overlay.innerHTML =
            '<video id="ptv" playsinline></video>' +
            '<div class="player-shade top"></div>' +
            '<div class="player-shade bottom"></div>' +
            '<div class="player-top"><img class="player-logo" alt=""><div class="player-titles"><div class="player-title"></div><div class="player-sub"></div></div><div class="player-livebadge">LIVE</div><div class="player-zap"></div></div>' +
            '<div class="player-center"></div>' +
            '<div class="player-bottom">' +
            '  <div class="player-epg"></div>' +
            '  <div class="player-seek"><div class="player-seektrack"><div class="player-seekbuf"></div><div class="player-seekfill"><i></i></div><div class="player-seekknob"></div></div><div class="player-times"><span class="t-cur">0:00</span><span class="t-dur">0:00</span></div></div>' +
            '  <div class="player-buttons"></div>' +
            '</div>' +
            '<div class="player-spinner"><div class="spinner"></div><div class="player-spinlabel"></div></div>';
        document.body.appendChild(overlay);
        video = overlay.querySelector('#ptv');
        wireVideo();
    }

    function wireVideo() {
        video.addEventListener('waiting', function () { showSpin(true); });
        video.addEventListener('playing', function () { startedOnce = true; showSpin(false); onPlaying(); });
        video.addEventListener('canplay', function () { showSpin(false); });
        video.addEventListener('pause', function () { showSpin(false); if (state) updButtons(); });
        video.addEventListener('play', function () { updButtons(); });
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('ended', onEnded);
        video.addEventListener('error', function () { onVideoError(); });
        video.addEventListener('loadedmetadata', function () {
            if (state && state.kind !== 'live' && state.startPos > 5 && isFinite(video.duration) && state.startPos < video.duration - 20) {
                try { video.currentTime = state.startPos; } catch (e) {}
            }
        });
    }

    function showSpin(on, label) {
        var s = overlay.querySelector('.player-spinner');
        s.classList.toggle('show', !!on);
        s.querySelector('.player-spinlabel').textContent = label || '';
    }

    /* ---------------- source attach ---------------- */
    function attach(rawUrl) {
        var url = XTV.net.streamRelay ? XTV.net.streamRelay(rawUrl) : rawUrl;
        destroyHls();
        retryExtDone = false; hlsFallbackDone = false;
        if (!isWebOS() && state && (state.kind === 'live' || state.kind === 'live-catchup') &&
            window.mpegts && mpegts.getFeatureList().mseLivePlayback) {
            attachMpegts(rawUrl);
            var p0 = video.play();
            if (p0 && p0.catch) p0.catch(function () {});
            return;
        }
        var isHls = /\.m3u8(\?|$)/i.test(url);
        var useNative = isHls ? (XTV.store.settings().preferNative && nativeHls() && isWebOS()) : true;
        if (!isHls && !isWebOS() && /\.ts(\?|$)/i.test(url)) {
            // desktop browsers cannot decode raw TS — hls.js won't help either
        }
        if (isHls && !useNative && window.Hls && Hls.isSupported()) {
            hls = new Hls({
                maxBufferLength: XTV.store.settings().bufferSec || 30,
                backBufferLength: 45,
                liveDurationInfinity: state && state.kind === 'live'
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.ERROR, function (ev, data) {
                if (data && data.fatal) {
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) { try { hls.startLoad(); } catch (e) {} }
                    else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { try { hls.recoverMediaError(); } catch (e) {} }
                    else onVideoError();
                }
            });
        } else {
            video.src = url;
            try { video.load(); } catch (e) {}
        }
        var p = video.play();
        if (p && p.catch) p.catch(function () {
            // autoplay policies in desktop browsers: wait for user key
            showSpin(false);
        });
    }

    function destroyHls() {
        if (mpegtsP) {
            try {
                mpegtsP.pause();
                mpegtsP.unload();
                mpegtsP.detachMediaElement();
                mpegtsP.destroy();
            } catch (e) {}
            mpegtsP = null;
        }
        if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
    }

    /* Browser-mode live streams are usually raw MPEG-TS (panels 302 their
       .m3u8 to .ts) which Chromium cannot demux — feed them through
       mpegts.js over the LAN relay instead. True-HLS providers fall back
       to hls.js through onVideoError. */
    function attachMpegts(rawUrl) {
        destroyHls();
        var url = XTV.net.streamRelay ? XTV.net.streamRelay(rawUrl) : rawUrl;
        mpegtsP = mpegts.createPlayer({
            type: 'mpegts', isLive: true, url: url
        }, { enableStashBuffer: false, liveBufferLatencyChasing: true });
        mpegtsP.attachMediaElement(video);
        mpegtsP.load();
        mpegtsP.on(mpegts.Events.ERROR, function () { onVideoError(); });
        try { video.play(); } catch (e) {}
    }

    function onVideoError() {
        if (!state) return;
        // 0) live in browser: switch to mpegts.js (raw TS) before giving up on hls.js
        if ((state.kind === 'live' || state.kind === 'live-catchup') && window.mpegts && !mpegtsP) {
            showSpin(true, 'Switching to TS demuxer…');
            var sM = state;
            setTimeout(function () {
                if (state === sM) attachMpegts(sM.url);
            }, 60);
            return;
        }
        // 1) try alternate container extension (panels differ: .ts ↔ .m3u8)
        if (!retryExtDone && state.altUrl) {
            retryExtDone = true;
            showSpin(true, 'Retrying alternate stream format…');
            var s = state;
            setTimeout(function () {
                if (state === s) attach(s.altUrl);
            }, 60);
            return;
        }
        // 2) native → hls.js fallback
        if (!hlsFallbackDone && window.Hls && Hls.isSupported() && !hls) {
            hlsFallbackDone = true;
            showSpin(true, 'Switching to software decoder…');
            var s2 = state;
            setTimeout(function () {
                if (state === s2) { XTV.store.setSetting('preferNative', false); attach(s2.url); }
            }, 60);
            return;
        }
        showSpin(false);
        var m = XTV.ui.modal({
            title: 'Playback failed',
            cls: 'modal-narrow',
            body: '<p class="modal-text">This stream could not be played.<br>' + U.esc(state.title || '') + '</p><p class="modal-dim">Check the stream in another app or try again — some providers throttle concurrent connections.</p>',
            buttons: [
                { label: 'Exit', primary: true, onSelect: function (close) { close(); exit(); } },
                { label: 'Retry', onSelect: function (close) { close(); retryExtDone = false; hlsFallbackDone = false; attach(state.url); } }
            ]
        });
    }

    /* ---------------- public API ---------------- */
    function play(opts) {
        ensureDom();
        optsOnExit = null;
        state = opts;
        wasStopped = false;
        startedOnce = false;
        lastInIntro = false;
        controlsOn = false; zone = 'scrub'; btnIdx = 0;
        zapDigits = '';
        overlay.classList.add('on');
        document.body.classList.add('player-active');
        try { if (window.PalmSystem && PalmSystem.setKeepAlive) PalmSystem.setKeepAlive(true); } catch (e) {}
        XTV.focus.enabled(false);

        renderTitles();
        buildButtons();
        var seek = overlay.querySelector('.player-seek');
        var epg = overlay.querySelector('.player-epg');
        if (opts.kind === 'live') { seek.style.display = 'none'; epg.style.display = ''; }
        else { seek.style.display = ''; epg.style.display = 'none'; }
        showSpin(true, 'Loading stream…');
        attach(opts.url);
        startProgressSaver();
        if (opts.kind === 'live') { refreshEpg(); infoTimer = setInterval(refreshEpg, 60000); }
        else refreshEpg();
        scheduleHide(5000);
    }

    function exit() {
        if (wasStopped) return;
        wasStopped = true;
        saveProgress(true);
        stopTimers();
        destroyHls();
        if (subBlobUrl) { try { URL.revokeObjectURL(subBlobUrl); } catch (e) {} subBlobUrl = null; }
        try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) {}
        overlay.classList.remove('on');
        document.body.classList.remove('player-active');
        XTV.focus.enabled(true);
        state = null;
        if (window.PalmSystem && PalmSystem.setKeepAlive) { try { PalmSystem.setKeepAlive(false); } catch (e) {} }
        if (optsOnExit) { var f = optsOnExit; optsOnExit = null; f(); }
    }

    var optsOnExit = null;
    function onExit(cb) { optsOnExit = cb; }

    function isActive() { return !!state; }

    /* ---------------- info bar / EPG ---------------- */
    function renderTitles() {
        overlay.querySelector('.player-title').textContent = state.title || '';
        overlay.querySelector('.player-sub').textContent = state.sub || '';
        var logo = overlay.querySelector('.player-logo');
        if (state.logo) { logo.style.display = ''; logo.src = state.logo; }
        else logo.style.display = 'none';
        overlay.querySelector('.player-livebadge').style.display = state.kind === 'live' ? '' : 'none';
    }

    function refreshEpg() {
        if (!state) return;
        var el = overlay.querySelector('.player-epg');
        if (state.epgText != null) { el.innerHTML = state.epgText; return; }
        if (state.epgProvider) {
            state.epgProvider(function (html) { if (state) el.innerHTML = html; });
        }
    }

    function updSeek() {
        if (!state || state.kind === 'live' || !isFinite(video.duration) || !video.duration) return;
        var pct = (video.currentTime / video.duration) * 100;
        overlay.querySelector('.player-seekfill').style.width = pct + '%';
        overlay.querySelector('.player-seekknob').style.left = pct + '%';
        overlay.querySelector('.t-cur').textContent = U.fmtTime(video.currentTime);
        overlay.querySelector('.t-dur').textContent = U.fmtTime(video.duration);
        var buf = video.buffered;
        if (buf && buf.length) {
            var end = buf.end(buf.length - 1);
            overlay.querySelector('.player-seekbuf').style.width = (end / video.duration) * 100 + '%';
        }
    }

    function inIntro() {
        return !!(state && state.kind === 'ep' && video.currentTime >= 6 &&
                  video.currentTime <= (XTV.store.settings().skipIntroSec || 120));
    }

    function onTimeUpdate() {
        updSeek();
        showSpin(false);
        if (state && state.kind !== 'live') saveProgress(false);
        if (state && state.kind === 'ep' && controlsOn) {
            var intro = inIntro();
            if (intro !== lastInIntro) {
                lastInIntro = intro;
                buildButtons();
                if (btnIdx >= BUTTONS.length) btnIdx = BUTTONS.length - 1;
                renderControlsFocus();
            }
        }
    }

    function onPlaying() {
        resetWatchdog();
    }

    function resetWatchdog() {
        clearInterval(watchdog);
        watchdog = setInterval(function () {
            if (!state) return;
            if (video.readyState < 2 && !video.paused) {
                stalls = (stalls || 0) + 1;
                if (stalls === 2 && state.kind === 'live') {
                    // nudge back to live edge
                    try {
                        if (isFinite(video.duration) && video.duration > 0) video.currentTime = video.duration - 1.5;
                    } catch (e) {}
                }
                if (stalls >= 4) {
                    stalls = 0;
                    showSpin(true, 'Reconnecting…');
                    var u = state.url;
                    attach(u);
                }
            } else stalls = 0;
        }, 4000);
    }
    var stalls = 0;

    function startProgressSaver() {
        stopProgressSaver();
        saveTimer = setInterval(function () { saveProgress(false); }, 5000);
    }
    function stopProgressSaver() { clearInterval(saveTimer); }

    function currentMeta() {
        return {
            title: state.title, sub: state.sub, icon: state.icon, backdrop: state.backdrop,
            seriesId: state.seriesId, kindLabel: state.kindLabel || ''
        };
    }

    function saveProgress(final) {
        if (!state || state.kind === 'live' || !isFinite(video.duration) || !video.duration) return;
        XTV.store.setProgress(state.kind, state.id, state.season, state.ep, video.currentTime, video.duration, currentMeta());
        if (final && state.onProgressSaved) state.onProgressSaved();
    }

    function onEnded() {
        if (!state) return;
        if (state.kind !== 'live') {
            // store pos=dur so the item stays in "recently watched" as fully watched
            var d = isFinite(video.duration) && video.duration ? video.duration : 0;
            XTV.store.setProgress(state.kind, state.id, state.season, state.ep, d, d, currentMeta());
            if (state.onNext && XTV.store.settings().autoplayNext) {
                var next = state.onNext();
                if (next) { countdownNext(next); return; }
            }
            toastEnd('Playback finished');
        }
    }

    function toastEnd(msg) {
        showSpin(false);
        overlay.querySelector('.player-center').innerHTML = '<div class="player-endmsg">' + U.esc(msg) + '</div>';
        setTimeout(function () {
            overlay.querySelector('.player-center').innerHTML = '';
            exit();
        }, 2200);
    }

    function countdownNext(next) {
        var el = overlay.querySelector('.player-center');
        var n = 8;
        var t = setInterval(function () {
            if (!state) { clearInterval(t); return; }
            el.innerHTML = '<div class="player-next"><div class="player-next-sub">Up next</div><div class="player-next-title">' + U.esc(next.title) + '</div>' +
                '<div class="player-next-count">Starting in ' + n + 's — OK to play now, BACK to cancel</div></div>';
            if (n-- <= 0) { clearInterval(t); el.innerHTML = ''; play(next); }
        }, 1000);
        nextCountdown = {
            cancel: function () { clearInterval(t); el.innerHTML = ''; },
            playNow: function () { clearInterval(t); el.innerHTML = ''; play(next); }
        };
    }

    /* ---------------- controls UI ---------------- */
    function buildButtons() {
        var row = overlay.querySelector('.player-buttons');
        row.innerHTML = '';
        BUTTONS = [];
        if (state.kind === 'live') {
            BUTTONS.push({ icon: '☰', label: 'Channels', cb: openSidebar });
            BUTTONS.push({ icon: '⭮', label: 'Restart', cb: function () { // catchup from top of current program
                if (state.catchupStart) {
                    var cu = XTV.xtream.catchupUrl(state.id, state.catchupStart, 0, /\.m3u8/i.test(state.url) ? 'm3u8' : 'ts');
                    play(Object.assign({}, state, { url: cu, kind: 'live-catchup' }));
                } else XTV.ui.toast('Catch-up not available for this channel');
            } });
        } else {
            if (inIntro()) {
                BUTTONS.push({ icon: '⏭', label: 'Skip intro', cls: ' pbtn-skip', cb: function () {
                    try { video.currentTime = (XTV.store.settings().skipIntroSec || 120) + 0.5; } catch (e) {}
                    XTV.ui.toast('Intro skipped');
                    lastInIntro = false;
                    buildButtons();
                    renderControlsFocus();
                } });
            }
            BUTTONS.push({ icon: 'CC', label: 'Subtitles', cb: subtitleMenu });
            if (state.onNext) BUTTONS.push({ icon: '⏭', label: 'Next episode', cb: function () { var n = state.onNext(); if (n) play(n); else XTV.ui.toast('No next episode'); } });
        }
        BUTTONS.push({ icon: '🕘', label: 'History', cb: historyMenu });
        BUTTONS.push({ icon: '⚙', label: 'Quality / Audio', cb: trackMenu });
        var html = '';
        for (var i = 0; i < BUTTONS.length; i++)
            html += '<div class="pbtn' + (BUTTONS[i].cls || '') + '" data-bi="' + i + '"><span class="pbtn-icon">' + BUTTONS[i].icon + '</span><span class="pbtn-label">' + BUTTONS[i].label + '</span></div>';
        row.innerHTML = html;
    }

    /* history & recents: continue watching, recent movies/series, live channels */
    function historyMenu() {
        clearTimeout(hideTimer);
        var cat = (XTV.app && XTV.app.catalog) || {};
        var entries = [];
        var seen = {};

        function push(key, icon, title, sub, act) {
            if (seen[key]) return;
            seen[key] = 1;
            entries.push({ key: key, icon: icon, title: title, sub: sub || '', act: act, ts: entries.length });
        }

        // live channels (recents)
        var liveById = {};
        (cat.live || []).forEach(function (c) { liveById[c.id] = c; });
        XTV.store.history().forEach(function (h) {
            if (h.kind === 'live' && liveById[h.id]) {
                var ch = liveById[h.id];
                push('live:' + h.id, ch.icon, ch.name, 'Channel ' + (ch.num != null ? ch.num : ''), function () {
                    m.close();
                    XTV.app.playLive(ch, cat.live, (cat.live || []).indexOf(ch));
                });
            }
        });

        // continue watching (exact resume points)
        var seriesInList = {}, movieInList = {};
        XTV.store.continueWatching().forEach(function (p) {
            if (p.kind === 'movie') {
                var mv = (cat.vod || []).find(function (x) { return String(x.id) === String(p.id); });
                if (mv) {
                    movieInList[String(p.id)] = 1;
                    push('movie:' + p.id, p.meta.icon || mv.icon, mv.name, U.fmtTime(Math.max(0, p.dur - p.pos)) + ' left', function () {
                        m.close(); XTV.app.playMovie(mv, p.pos);
                    });
                }
            } else if (p.kind === 'ep' && p.meta.seriesId != null) {
                var se = (cat.series || []).find(function (x) { return String(x.id) === String(p.meta.seriesId); });
                if (se) {
                    seriesInList[String(p.meta.seriesId)] = 1;
                    push('ep:' + p.meta.seriesId + ':' + p.season + ':' + p.ep, p.meta.icon || se.icon,
                        se.name, 'S' + p.season + ' E' + p.ep + ' · ' + U.fmtTime(Math.max(0, p.dur - p.pos)) + ' left', function () {
                        m.close(); XTV.app.playEpisodeAt(se, p.season, p.ep, p.pos);
                    });
                }
            }
        });

        // recently watched series / movies (incl. finished; skip dupes of the above)
        XTV.store.recentlyWatchedSeries().forEach(function (r) {
            if (seriesInList[String(r.seriesId)]) return;
            var se = (cat.series || []).find(function (x) { return String(x.id) === String(r.seriesId); });
            if (!se) return;
            push('rseries:' + r.seriesId + ':' + r.ts, r.icon || se.icon, se.name,
                r.season != null ? 'S' + r.season + ' E' + r.ep : '', function () {
                    m.close(); XTV.app.playEpisodeAt(se, r.season, r.ep, 0);
                });
        });
        XTV.store.recentlyWatchedMovies().forEach(function (r) {
            if (movieInList[String(r.id)]) return;
            var mv = (cat.vod || []).find(function (x) { return String(x.id) === String(r.id); });
            if (!mv) return;
            push('rmovie:' + r.id + ':' + r.ts, r.icon || mv.icon, mv.name,
                r.frac >= 0.98 ? 'Watched' : (r.pos > 30 && r.dur ? U.fmtTime(r.dur - r.pos) + ' left' : ''), function () {
                    m.close(); XTV.app.playMovie(mv, r.frac >= 0.98 ? 0 : r.pos);
                });
        });

        if (!entries.length) {
            XTV.ui.toast('No history yet');
            return;
        }
        var html = entries.map(function (en, i) {
            return '<div class="menu-item hist-item" data-x data-hi="' + i + '">' +
                '<img class="hist-icon" src="' + U.esc(en.icon || U.placeholder(en.title, 'wide')) + '" onerror="this.style.visibility=\'hidden\'">' +
                '<div class="hist-txt"><div class="hist-title">' + U.esc(en.title) + '</div>' +
                '<div class="hist-sub">' + U.esc(en.sub) + '</div></div></div>';
        }).join('');
        var hm = XTV.ui.modal({
            title: 'History & Recents',
            cls: 'modal-menu',
            body: html,
            buttons: [{ label: 'Close', primary: true, onSelect: function (close) { close(); } }]
        });
        hm.box.querySelector('.modal-body').addEventListener('xfselect', function (e) {
            var i = parseInt(e.detail.el.getAttribute('data-hi'), 10);
            if (entries[i]) entries[i].act();
        });
    }

    function updButtons() {
        overlay.querySelector('.player-center').innerHTML =
            (startedOnce && video.paused && !nextCountdown) ? '<div class="player-paused">❚❚ Paused</div>' : '';
    }

    function renderControlsFocus() {
        var pbs = overlay.querySelectorAll('.pbtn');
        for (var i = 0; i < pbs.length; i++) pbs[i].classList.toggle('xf', zone === 'buttons' && i === btnIdx);
        overlay.querySelector('.player-seektrack').classList.toggle('xf', zone === 'scrub' && state.kind !== 'live');
    }

    function showControls(on) {
        controlsOn = on;
        overlay.classList.toggle('controls', on);
        if (on) {
            zone = state && state.kind === 'live' ? 'buttons' : 'scrub';
            btnIdx = 0;
            renderControlsFocus();
            scheduleHide(6000);
        } else {
            overlay.querySelector('.player-zap').textContent = '';
        }
    }

    function scheduleHide(ms) {
        clearTimeout(hideTimer);
        if (!controlsOn) return;
        hideTimer = setTimeout(function () { showControls(false); }, ms || 5000);
    }

    function seekBy(sec) {
        if (!isFinite(video.duration)) return;
        var t = U.clamp(video.currentTime + sec, 0, Math.max(0, video.duration - 0.5));
        try { video.currentTime = t; } catch (e) {}
        updSeek();
        scheduleHide(6000);
    }

    /* ---------------- live zapping ---------------- */
    function zap(delta) {
        if (!state || state.kind !== 'live' || !state.channelList) return;
        var idx = state.channelIndex + delta;
        if (idx < 0) idx = state.channelList.length - 1;
        if (idx >= state.channelList.length) idx = 0;
        tuneTo(state.channelList, idx);
    }

    function tuneTo(list, idx) {
        var ch = list[idx];
        if (!ch) return;
        var ext = 'm3u8';
        play({
            kind: 'live',
            id: ch.id,
            url: XTV.xtream.liveUrl(ch.id, ext),
            altUrl: XTV.xtream.liveUrl(ch.id, 'ts'),
            title: ch.name,
            sub: 'CH ' + (ch.num != null ? ch.num : idx + 1),
            logo: ch.icon,
            channelList: list,
            channelIndex: idx,
            epgProvider: function (cb) {
                XTV.epg.nowNext(ch).then(function (nn) {
                    var html = '';
                    if (nn && nn.now) {
                        var pct = nn.now.stop > nn.now.start ?
                            ((Date.now() - nn.now.start.getTime()) / (nn.now.stop - nn.now.start)) * 100 : 0;
                        html = '<div class="player-epg-now"><span class="player-epg-time">' + U.fmtClock(nn.now.start) + ' – ' + U.fmtClock(nn.now.stop) + '</span> ' + U.esc(nn.now.title) + '</div>' +
                            (nn.next ? '<div class="player-epg-next">Next: ' + U.fmtClock(nn.next.start) + ' ' + U.esc(nn.next.title) + '</div>' : '') +
                            '<div class="player-epg-line"><i style="width:' + U.clamp(pct, 0, 100) + '%"></i></div>';
                        state.catchupStart = Math.floor(nn.now.start.getTime() / 1000);
                    }
                    cb(html);
                });
            },
            history: { kind: 'live', id: ch.id, title: ch.name, sub: '', icon: ch.icon }
        });
    }

    function digit(d) {
        if (!state || state.kind !== 'live' || !state.channelList) return;
        zapDigits += d;
        overlay.querySelector('.player-zap').textContent = zapDigits;
        clearTimeout(zapTimer);
        var list = state.channelList;
        var match = -1;
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].num) === zapDigits) { match = i; break; }
        }
        zapTimer = setTimeout(function () {
            var d2 = parseInt(zapDigits, 10);
            zapDigits = '';
            overlay.querySelector('.player-zap').textContent = '';
            if (match >= 0) tuneTo(list, match);
            else if (d2) {
                // nearest channel number
                var best = -1, bestDiff = 1e9;
                for (var j = 0; j < list.length; j++) {
                    var diff = Math.abs((list[j].num || 0) - d2);
                    if (diff < bestDiff) { bestDiff = diff; best = j; }
                }
                if (best >= 0 && bestDiff <= 2) tuneTo(list, best);
            }
        }, 1100);
    }

    /* ---------------- sidebar (live channels) ---------------- */
    function openSidebar() {
        if (!state || !state.channelList) return;
        var list = state.channelList;
        var cats = XTV.app.liveCategories();
        var body = U.el('div', 'chan-wrap');
        body.innerHTML = '<div class="chan-cats x-scroll"></div><div class="chan-list x-scroll"></div>';
        var catEl = body.querySelector('.chan-cats');
        var listEl = body.querySelector('.chan-list');
        var curCat = 'all';
        var favOnly = false;

        function renderCats() {
            var html = '<div class="chan-cat' + (curCat === 'all' && !favOnly ? ' on' : '') + '" data-x data-cat="all">All Channels</div>';
            html += '<div class="chan-cat' + (favOnly ? ' on' : '') + '" data-x data-cat="fav">★ Favorites</div>';
            (cats || []).forEach(function (c) {
                html += '<div class="chan-cat' + (curCat === c.id && !favOnly ? ' on' : '') + '" data-x data-cat="' + U.esc(c.id) + '">' + U.esc(c.name) + '</div>';
            });
            catEl.innerHTML = html;
        }
        function renderList() {
            var shown = list.filter(function (c) {
                if (favOnly && !XTV.store.isFav('live', c.id)) return false;
                if (curCat !== 'all' && c.catId !== curCat) return false;
                return true;
            });
            listEl.innerHTML = shown.slice(0, 600).map(function (c, i) {
                var nn = c._nn;
                return '<div class="chan-item' + (c.id === state.id ? ' current' : '') + '" data-x data-ci="' + list.indexOf(c) + '">' +
                    '<img class="chan-logo" src="' + U.esc(c.icon || U.placeholder(c.name, 'wide')) + '" onerror="this.style.visibility=\'hidden\'">' +
                    '<div class="chan-info"><div class="chan-name">' + U.esc(c.name) + '</div>' +
                    '<div class="chan-now">' + (c._now ? U.esc(c._now) : '&nbsp;') + '</div></div></div>';
            }).join('');
            listEl._shown = shown;
        }
        renderCats();
        renderList();
        var m = XTV.ui.modal({
            title: 'Channels',
            cls: 'modal-sidebar',
            body: function (b) { b.appendChild(body); },
            buttons: [
                { label: 'Close', primary: true, onSelect: function (close) { close(); } }
            ]
        });
        catEl.addEventListener('xfselect', function (e) {
            var c = e.detail.el.getAttribute('data-cat');
            if (c === 'fav') favOnly = !favOnly; else { favOnly = false; curCat = c; }
            renderCats(); renderList();
            XTV.focus.setFocused(e.detail.el);
        });
        listEl.addEventListener('xfselect', function (e) {
            var ci = parseInt(e.detail.el.getAttribute('data-ci'), 10);
            m.close();
            tuneTo(state.channelList, ci);
        });
        listEl.addEventListener('xfocus', U.throttle(function (e) {
            var ci = parseInt(e.detail.el.getAttribute('data-ci'), 10);
            var ch = state.channelList[ci];
            if (ch && !ch._now) {
                XTV.epg.nowNext(ch).then(function (nn) {
                    ch._now = nn && nn.now ? (U.fmtClock(nn.now.start) + ' ' + nn.now.title) : '';
                    var el = listEl.querySelector('[data-ci="' + ci + '"] .chan-now');
                    if (el) el.textContent = ch._now;
                });
            }
        }, 250));
    }

    /* ---------------- track menus ---------------- */
    function trackMenu() {
        clearTimeout(hideTimer);
        var items = [];
        var cur = -1;
        if (hls) {
            cur = hls.autoLevelEnabled ? -2 : hls.currentLevel;
            items.push({ label: 'Auto', sel: cur === -2, cb: function () { hls.currentLevel = -1; } });
            for (var i = 0; i < hls.levels.length; i++) {
                (function (li) {
                    var h = hls.levels[li].height ? (hls.levels[li].height + 'p') :
                        Math.round((hls.levels[li].bitrate || 0) / 1000) + ' kbps';
                    items.push({ label: h, sel: li === cur, cb: function () { hls.currentLevel = li; } });
                })(i);
            }
            if (hls.audioTracks && hls.audioTracks.length > 1) {
                items.push({ sep: 'Audio' });
                for (var a = 0; a < hls.audioTracks.length; a++) {
                    (function (ai) {
                        items.push({ label: hls.audioTracks[ai].name || ('Track ' + (ai + 1)), sel: hls.audioTrack === ai, cb: function () { hls.audioTrack = ai; } });
                    })(a);
                }
            }
        } else if (video.audioTracks && video.audioTracks.length > 1) {
            for (var t = 0; t < video.audioTracks.length; t++) {
                (function (ti) {
                    items.push({ label: video.audioTracks[ti].label || video.audioTracks[ti].language || ('Audio ' + (ti + 1)), sel: video.audioTracks[ti].enabled, cb: function () {
                        for (var x = 0; x < video.audioTracks.length; x++) video.audioTracks[x].enabled = x === ti;
                    } });
                })(t);
            }
        }
        if (!items.length) items.push({ label: 'Auto (device default)', sel: true, cb: function () {} });
        var html = items.map(function (it, i) {
            return it.sep ? '<div class="menu-sep">' + U.esc(it.sep) + '</div>' :
                '<div class="menu-item' + (it.sel ? ' sel' : '') + '" data-x data-mi="' + i + '">' + U.esc(it.label) + (it.sel ? ' ✓' : '') + '</div>';
        }).join('');
        var m = XTV.ui.modal({
            title: 'Playback settings',
            cls: 'modal-menu',
            body: html,
            buttons: [{ label: 'Close', primary: true, onSelect: function (close) { close(); } }]
        });
        m.box.querySelector('.modal-body').addEventListener('xfselect', function (e) {
            var i = parseInt(e.detail.el.getAttribute('data-mi'), 10);
            if (items[i] && items[i].cb) { items[i].cb(); }
            m.close();
            scheduleHide(4000);
        });
    }

    function subtitleMenu() {
        clearTimeout(hideTimer);
        var items = [{ label: 'Off', sel: !activeSub(), cb: function () { disableSubs(); } }];
        var tracks = video.textTracks || [];
        for (var i = 0; i < tracks.length; i++) {
            (function (ti) {
                var tt = tracks[ti];
                if (tt.kind && tt.kind !== 'subtitles' && tt.kind !== 'captions') return;
                items.push({ label: (tt.label || tt.language || ('Track ' + (ti + 1))), sel: tt.mode === 'showing', cb: function () {
                    for (var x = 0; x < tracks.length; x++) if (tracks[x].kind === 'subtitles' || tracks[x].kind === 'captions') tracks[x].mode = x === ti ? 'showing' : 'disabled';
                } });
            })(i);
        }
        items.push({ label: 'Search OpenSubtitles…', cb: function () { searchSubs(); } });
        var html = items.map(function (it, i) {
            return '<div class="menu-item' + (it.sel ? ' sel' : '') + '" data-x data-mi="' + i + '">' + U.esc(it.label) + (it.sel ? ' ✓' : '') + '</div>';
        }).join('');
        var m = XTV.ui.modal({
            title: 'Subtitles',
            cls: 'modal-menu',
            body: html,
            buttons: [{ label: 'Close', primary: true, onSelect: function (close) { close(); } }]
        });
        m.box.querySelector('.modal-body').addEventListener('xfselect', function (e) {
            var i = parseInt(e.detail.el.getAttribute('data-mi'), 10);
            if (items[i] && items[i].cb) items[i].cb();
            m.close();
            scheduleHide(4000);
        });
    }

    function activeSub() {
        var tracks = video.textTracks || [];
        for (var i = 0; i < tracks.length; i++) if (tracks[i].mode === 'showing') return tracks[i];
        return null;
    }
    function disableSubs() {
        var tracks = video.textTracks || [];
        for (var i = 0; i < tracks.length; i++) tracks[i].mode = 'disabled';
    }

    function searchSubs() {
        if (!XTV.store.settings().osKey) {
            XTV.ui.modal({
                title: 'OpenSubtitles',
                cls: 'modal-narrow',
                body: '<p class="modal-text">Add your free OpenSubtitles API key in Settings → Integrations to search subtitles for this title.</p>',
                buttons: [{ label: 'OK', primary: true, onSelect: function (c) { c(); } }]
            });
            return;
        }
        var q = state.metaTitle || state.title;
        var params = { query: q, languages: XTV.store.settings().subtitleLang || 'en' };
        if (state.season) { params.season_number = state.season; params.episode_number = state.ep; }
        var url = 'https://api.opensubtitles.com/api/v1/subtitles?' + U.qs(params);
        XTV.ui.spinner(true, 'Searching subtitles…');
        XTV.net.request({ url: url, responseType: 'json', timeout: 15000, headers: { 'Api-Key': XTV.store.settings().osKey, 'User-Agent': 'SolsticeTV/1.0' } }, function (err, j) {
            XTV.ui.spinner(false);
            if (err || !j || !j.data || !j.data.length) {
                XTV.ui.toast('No subtitles found'); return;
            }
            var opts = j.data.slice(0, 10).map(function (d) {
                var a = d.attributes || {};
                return { label: (a.language || '?') + ' — ' + ((a.release && a.release.replace(/\./g, ' ')) || a.file_name || 'subtitle'), fileId: a.files && a.files[0] ? a.files[0].file_id : null, hi: a.hearing_impaired };
            }).filter(function (o) { return o.fileId; });
            if (!opts.length) { XTV.ui.toast('No downloadable subtitles found'); return; }
            var html = opts.map(function (o, i) {
                return '<div class="menu-item" data-x data-mi="' + i + '">' + U.esc(o.label) + '</div>';
            }).join('');
            var m = XTV.ui.modal({
                title: 'Subtitles — ' + q,
                cls: 'modal-menu',
                body: html,
                buttons: [{ label: 'Close', primary: true, onSelect: function (close) { close(); } }]
            });
            m.box.querySelector('.modal-body').addEventListener('xfselect', function (e) {
                var i = parseInt(e.detail.el.getAttribute('data-mi'), 10);
                m.close();
                downloadSub(opts[i].fileId);
            });
        });
    }

    function downloadSub(fileId) {
        XTV.ui.spinner(true, 'Downloading subtitle…');
        var s = XTV.store.settings();
        XTV.net.request({
            url: 'https://api.opensubtitles.com/api/v1/download?file_id=' + fileId,
            responseType: 'json', timeout: 20000,
            headers: { 'Api-Key': s.osKey, 'User-Agent': 'SolsticeTV/1.0' }
        }, function (err, j) {
            if (err || !j || !j.link) { XTV.ui.spinner(false); XTV.ui.toast('Subtitle download failed'); return; }
            XTV.net.request({ url: j.link, responseType: 'text', timeout: 20000 }, function (err2, text) {
                XTV.ui.spinner(false);
                if (err2 || !text) { XTV.ui.toast('Subtitle download failed'); return; }
                addSubTrack(srtToVtt(text));
            });
        });
    }

    function srtToVtt(srt) {
        var vtt = 'WEBVTT\n\n' + String(srt)
            .replace(/\r+/g, '')
            .replace(/^\uFEFF/, '')
            .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        // strip numeric cue indices (harmless but cleaner)
        return vtt;
    }

    var subBlobUrl = null;
    function addSubTrack(vtt) {
        disableSubs();
        if (subBlobUrl) { try { URL.revokeObjectURL(subBlobUrl); } catch (e) {} subBlobUrl = null; }
        var blob = new Blob([vtt], { type: 'text/vtt' });
        subBlobUrl = URL.createObjectURL(blob);
        var track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = 'OpenSubtitles';
        track.src = subBlobUrl;
        track['default'] = true;
        video.appendChild(track);
        setTimeout(function () {
            var tracks = video.textTracks;
            for (var i = 0; i < tracks.length; i++)
                if (tracks[i].label === 'OpenSubtitles') tracks[i].mode = 'showing';
            XTV.ui.toast('Subtitles enabled');
        }, 300);
    }

    /* ---------------- key routing (called by app when player active & no modal) ---------------- */
    var repeatT0 = 0;
    function onKey(key) {
        if (!state) return false;
        if (nextCountdown) {
            if (key === 'ok') { nextCountdown.playNow(); nextCountdown = null; return true; }
            if (key === 'back') { nextCountdown.cancel(); nextCountdown = null; return true; }
        }
        // media keys always
        switch (key) {
            case 'play': if (video.paused) video.play(); return true;
            case 'pause': if (!video.paused) video.pause(); return true;
            case 'playpause': video.paused ? video.play() : video.pause(); return true;
            case 'stop': exit(); return true;
            case 'ff': seekBy(30); return true;
            case 'rw': seekBy(-30); return true;
            case 'chup': zap(1); return true;
            case 'chdown': zap(-1); return true;
        }
        if (state.kind === 'live' && key >= '0' && key <= '9') { digit(key); return true; }

        if (!controlsOn) {
            if (key === 'back') { exit(); return true; }
            if (state.kind === 'live' && key === 'up') { zap(-1); return true; }
            if (state.kind === 'live' && key === 'down') { zap(1); return true; }
            showControls(true);
            return true;
        }
        // controls on
        switch (key) {
            case 'back':
                if (zone === 'buttons') { zone = 'scrub'; renderControlsFocus(); }
                else showControls(false);
                scheduleHide(6000);
                return true;
            case 'ok':
                if (zone === 'buttons') {
                    var b = BUTTONS[btnIdx];
                    if (b) b.cb();
                } else if (!startedOnce) {
                    // autoplay was blocked or the source stalled — retry on user action
                    var p2 = video.play();
                    if (p2 && p2.catch) p2.catch(function () { XTV.ui.toast('Playback could not start'); });
                    scheduleHide(4000);
                } else if (state.kind !== 'live') {
                    video.paused ? video.play() : video.pause();
                    scheduleHide(5000);
                } else {
                    openSidebar();
                }
                return true;
            case 'left':
            case 'right':
                if (state.kind === 'live' || zone === 'buttons') {
                    // walk the transport row (wraps around)
                    var delta = key === 'left' ? -1 : 1;
                    btnIdx = (btnIdx + delta + BUTTONS.length) % BUTTONS.length;
                    renderControlsFocus();
                    scheduleHide(8000);
                    return true;
                }
                var now = Date.now();
                var step = 10;
                if (now - repeatT0 > 1600) step = 60;
                if (now - repeatT0 > 4000) step = 300;
                seekBy(key === 'left' ? -step : step);
                repeatT0 = Date.now();
                scheduleHide(8000);
                return true;
            case 'up':
                if (state.kind === 'live' && controlsOn) { zap(-1); return true; }
                if (zone === 'scrub' && BUTTONS.length) {
                    zone = 'buttons'; btnIdx = 0; renderControlsFocus();
                }
                scheduleHide(8000);
                return true;
            case 'down':
                if (state.kind === 'live' && controlsOn) { zap(1); return true; }
                if (zone === 'buttons') { zone = 'scrub'; renderControlsFocus(); }
                else showControls(false);
                return true;
        }
        return false;
    }

    function stopTimers() {
        clearInterval(infoTimer); clearInterval(watchdog);
        clearTimeout(hideTimer); clearTimeout(zapTimer);
        if (nextCountdown) { nextCountdown.cancel(); nextCountdown = null; }
        stopProgressSaver();
    }

    /* progress bookkeeping for continue-watching exit hook */
    function bindExit(cb) { onExit(cb); }

    XTV.player = {
        play: play, exit: exit, isActive: isActive, onKey: onKey,
        tuneTo: tuneTo, bindExit: bindExit,
        video: function () { return video; }
    };
})();
