/* Solstice TV — Settings: profiles, playback, EPG, integrations, parental, appearance, data. */
(function () {
    'use strict';
    var U = XTV.util;

    var SECTIONS = [
        { id: 'profiles', name: 'Profiles' },
        { id: 'playback', name: 'Playback' },
        { id: 'guide', name: 'Guide & EPG' },
        { id: 'integrations', name: 'Integrations' },
        { id: 'parental', name: 'Parental Control' },
        { id: 'appearance', name: 'Appearance' },
        { id: 'mobile', name: 'Edit on Mobile' },
        { id: 'data', name: 'Data & Diagnostics' },
        { id: 'about', name: 'About' }
    ];

    function build() {
        var root = U.el('div', 'screen settings-screen');
        var nav = U.el('div', 'settings-nav x-scroll');
        var pane = U.el('div', 'settings-pane x-scroll');
        root.appendChild(nav);
        root.appendChild(pane);
        var cur = 'profiles';

        function renderNav() {
            nav.innerHTML = '';
            SECTIONS.forEach(function (s) {
                var el = U.el('div', 'settings-nav-item' + (cur === s.id ? ' on' : ''), U.esc(s.name));
                el.setAttribute('data-x', '');
                el._sec = s.id;
                nav.appendChild(el);
            });
        }

        function rowToggle(label, get, set, sub) {
            var el = U.el('div', 'set-row');
            el.setAttribute('data-x', '');
            el.innerHTML = '<div class="set-label">' + U.esc(label) + (sub ? '<div class="set-sub">' + U.esc(sub) + '</div>' : '') + '</div>' +
                '<div class="set-toggle' + (get() ? ' on' : '') + '"><i></i></div>';
            el.addEventListener('xfselect', function () {
                set(!get());
                el.querySelector('.set-toggle').classList.toggle('on', get());
            });
            return el;
        }

        function rowValue(label, get, onEdit, sub) {
            var el = U.el('div', 'set-row');
            el.setAttribute('data-x', '');
            el.innerHTML = '<div class="set-label">' + U.esc(label) + (sub ? '<div class="set-sub">' + U.esc(sub) + '</div>' : '') + '</div>' +
                '<div class="set-value">' + U.esc(get()) + '</div>';
            el.addEventListener('xfselect', function () {
                onEdit(function (v) {
                    el.querySelector('.set-value').textContent = v;
                });
            });
            return el;
        }

        function rowAction(label, cb, cls) {
            var el = U.el('div', 'set-row set-action' + (cls ? ' ' + cls : ''), U.esc(label));
            el.setAttribute('data-x', '');
            el.addEventListener('xfselect', cb);
            return el;
        }

        var panes = {

            profiles: function () {
                var wrap = U.el('div');
                XTV.store.profiles().forEach(function (p) {
                    var active = XTV.store.activeProfile() && XTV.store.activeProfile().id === p.id;
                    var el = U.el('div', 'set-row');
                    el.setAttribute('data-x', '');
                    el.innerHTML = '<div class="set-label">' + U.esc(p.name) + '<div class="set-sub">' + U.esc(p.url) + '</div></div>' +
                        (active ? '<div class="set-value">ACTIVE</div>' : '<div class="set-value">switch ▸</div>');
                    el.addEventListener('xfselect', function () {
                        XTV.ui.modal({
                            title: p.name,
                            cls: 'modal-narrow',
                            body: '<p class="modal-dim">' + U.esc(p.url) + '<br>User: ' + U.esc(p.username) + '</p>',
                            buttons: [
                                { label: 'Close', onSelect: function (c) { c(); } },
                                { label: 'Edit', onSelect: function (c) { c(); XTV.app.push('login', { profile: p }); } },
                                {
                                    label: active ? 'Saved' : 'Activate', primary: !active, onSelect: function (c) {
                                        c();
                                        if (!active) {
                                            XTV.store.setActiveProfile(p.id);
                                            XTV.app.reloadProfiles();
                                        }
                                    }
                                }
                            ]
                        });
                    });
                    wrap.appendChild(el);
                });
                wrap.appendChild(rowAction('+ Add Profile', function () { XTV.app.push('login', {}); }));
                return wrap;
            },

            playback: function () {
                var s = XTV.store.settings();
                var w = U.el('div');
                w.appendChild(rowToggle('Prefer hardware decoder',
                    function () { return s.preferNative; },
                    function (v) { XTV.store.setSetting('preferNative', v); },
                    'Use webOS native media pipeline for HLS/TS (recommended). Disable to always use software HLS.'));
                w.appendChild(rowValue('Buffer target', function () { return (s.bufferSec || 30) + ' s'; }, function (set) {
                    var opts = [10, 20, 30, 45, 60];
                    var i = Math.max(0, opts.indexOf(s.bufferSec || 30));
                    var v = opts[(i + 1) % opts.length];
                    XTV.store.setSetting('bufferSec', v); set(v + ' s');
                }, 'Software decoder buffer (hls.js)'));
                w.appendChild(rowToggle('Autoplay next episode',
                    function () { return s.autoplayNext; },
                    function (v) { XTV.store.setSetting('autoplayNext', v); }));
                w.appendChild(rowValue('Skip intro target', function () { return s.skipIntroSec + ' s'; }, function (set) {
                    var opts = [90, 120, 150];
                    var i = Math.max(0, opts.indexOf(s.skipIntroSec || 120));
                    var v = opts[(i + 1) % opts.length];
                    XTV.store.setSetting('skipIntroSec', v); set(v + ' s');
                }, 'Episode intro window shown in the player (6s to this point)'));
                w.appendChild(rowValue('Mark watched at', function () { return s.markWatchedPct + '%'; }, function (set) {
                    var opts = [80, 90, 95, 100];
                    var i = Math.max(0, opts.indexOf(s.markWatchedPct));
                    var v = opts[(i + 1) % opts.length];
                    XTV.store.setSetting('markWatchedPct', v); set(v + '%');
                }, 'Episode progress that counts as watched'));
                return w;
            },

            guide: function () {
                var s = XTV.store.settings();
                var w = U.el('div');
                w.appendChild(rowToggle('Full guide (xmltv)',
                    function () { return s.fullEpg; },
                    function (v) { XTV.store.setSetting('fullEpg', v); },
                    'Download the complete XMLTV guide for catch-up and browsing. Uses more memory.'));
                w.appendChild(rowValue('Timezone offset', function () {
                    return (s.epgOffsetHours > 0 ? '+' : '') + s.epgOffsetHours + ' h';
                }, function (set) {
                    var v = ((s.epgOffsetHours + 13) % 26) - 13;
                    XTV.store.setSetting('epgOffsetHours', v);
                    set((v > 0 ? '+' : '') + v + ' h');
                    XTV.epg.clearShortCache();
                }, 'Fix EPG times if they are in the wrong timezone'));
                var fi = XTV.epg.fullInfo();
                w.appendChild(rowAction(fi ? 'Guide loaded: ' + fi.channelCount + ' channels, ' + U.fmtAgo(fi.loadedAt) : 'Guide not loaded yet', function () {
                    XTV.ui.spinner(true, 'Loading full guide…');
                    XTV.epg.loadFull(true).then(function () {
                        XTV.ui.spinner(false);
                        XTV.ui.toast('Guide updated');
                        renderPane();
                    });
                }));
                return w;
            },

            integrations: function () {
                var s = XTV.store.settings();
                var w = U.el('div');
                w.appendChild(rowValue('TMDB API key', function () { return s.tmdbKey ? '•••••••• (set)' : 'not set'; }, function (set) {
                    XTV.ui.promptText('TMDB API key (v3)', s.tmdbKey, true, function (v) {
                        XTV.store.setSetting('tmdbKey', (v || '').trim());
                        set(s.tmdbKey ? '•••••••• (set)' : 'not set');
                        XTV.ui.toast(s.tmdbKey ? 'TMDB enabled — posters, backdrops, cast & more' : 'TMDB disabled');
                    });
                }, 'Free key at themoviedb.org — unlocks artwork, cast, ratings'));
                w.appendChild(rowValue('OMDb API key', function () { return s.omdbKey ? '•••••••• (set)' : 'not set'; }, function (set) {
                    XTV.ui.promptText('OMDb API key', s.omdbKey, true, function (v) {
                        XTV.store.setSetting('omdbKey', (v || '').trim());
                        set(s.omdbKey ? '•••••••• (set)' : 'not set');
                    });
                }, 'Free key at omdbapi.com — shows IMDb / Rotten Tomatoes scores'));
                w.appendChild(rowValue('OpenSubtitles API key', function () { return s.osKey ? '•••••••• (set)' : 'not set'; }, function (set) {
                    XTV.ui.promptText('OpenSubtitles API key', s.osKey, true, function (v) {
                        XTV.store.setSetting('osKey', (v || '').trim());
                        set(s.osKey ? '•••••••• (set)' : 'not set');
                    });
                }, 'Free key at opensubtitles.com — subtitle search in player'));
                w.appendChild(rowValue('Subtitle language', function () { return s.subtitleLang || 'en'; }, function (set) {
                    XTV.ui.promptText('Language code (e.g. en, de, es…)', s.subtitleLang, false, function (v) {
                        XTV.store.setSetting('subtitleLang', (v || 'en').trim().toLowerCase());
                        set((v || 'en').trim().toLowerCase());
                    });
                }));
                return w;
            },

            parental: function () {
                var s = XTV.store.settings();
                var w = U.el('div');
                w.appendChild(rowToggle('Require PIN on launch', function () { return s.pinEnabled; }, function (v) {
                    if (v && !s.pin) { XTV.ui.toast('Set a PIN first'); return; }
                    XTV.store.setSetting('pinEnabled', v);
                }, 'Ask for PIN when opening the app'));
                w.appendChild(rowToggle('PIN-lock adult content', function () { return s.pinAdult; }, function (v) {
                    if (v && !s.pin) { XTV.ui.toast('Set a PIN first'); return; }
                    XTV.store.setSetting('pinAdult', v);
                    XTV.ui.toast(v ? 'Adult content requires PIN to play' : 'Adult PIN lock off');
                }, 'Require PIN before playing adult-category channels/VOD'));
                w.appendChild(rowAction(s.pin ? 'Change PIN' : 'Set PIN', function () {
                    XTV.ui.pinpad('Enter new PIN (4 digits)', function (val) {
                        XTV.store.setSetting('pin', val);
                        XTV.store.setSetting('pinEnabled', true);
                        XTV.ui.toast('PIN saved & enabled');
                        renderPane();
                    });
                }));
                w.appendChild(rowToggle('Hide adult categories', function () { return s.hideAdult; }, function (v) {
                    XTV.store.setSetting('hideAdult', v);
                    XTV.ui.toast(v ? 'Adult categories hidden' : 'All categories shown');
                    XTV.app.reloadProfiles();
                }, 'Filters categories named XXX/Adult/18+'));
                return w;
            },

            appearance: function () {
                var s = XTV.store.settings();
                var w = U.el('div');
                w.appendChild(rowToggle('Ambient background', function () { return s.ambient; }, function (v) {
                    XTV.store.setSetting('ambient', v);
                    XTV.app.ambient('');
                }, 'Blurred artwork behind browsed content'));
                w.appendChild(rowValue('Accent color', function () { return s.accent; }, function (set) {
                    var opts = ['#e8a946', '#0a84ff', '#ff375f', '#248a3d', '#bf5af2', '#c93400', '#5e5ce6'];
                    var v = opts[(opts.indexOf(s.accent) + 1) % opts.length];
                    XTV.store.setSetting('accent', v);
                    XTV.app.applyAccent(v);
                    set(v);
                }));
                w.appendChild(rowValue('Screensaver', function () {
                    var v = s.screensaverMin || 0;
                    return v ? v + ' min' : 'Off';
                }, function (set) {
                    var opts = [0, 5, 10, 15, 30];
                    var i = Math.max(0, opts.indexOf(s.screensaverMin || 0));
                    var v = opts[(i + 1) % opts.length];
                    XTV.store.setSetting('screensaverMin', v);
                    set(v ? v + ' min' : 'Off');
                    if (XTV.app.resetScreensaver) XTV.app.resetScreensaver();
                }, 'Show clock screensaver after idle'));
                return w;
            },

            mobile: function () {
                var w = U.el('div');

                var intro = U.el('div', 'set-row');
                intro.innerHTML = '<div class="set-label">Edit on Mobile' +
                    '<div class="set-sub">Scan the QR with your iPhone (same WiFi) to open a remote control page and change settings from your phone. Changes apply to the TV live. Requires the app to be served over your network ("npm run serve").</div></div>';
                w.appendChild(intro);

                var statusRow = U.el('div', 'set-row');
                statusRow.setAttribute('data-x', '');
                statusRow.innerHTML = '<div class="set-label" id="mob-status">Starting…</div><div class="set-value" id="mob-pair"></div>';
                statusRow.addEventListener('xfselect', function () {
                    if (XTV.remote.isRunning()) { XTV.remote.stop(); renderPane(); }
                });
                w.appendChild(statusRow);

                var qrWrap = U.el('div', 'qr-wrap');
                qrWrap.innerHTML = '<div class="qr-tile" id="mob-qr"></div><div class="qr-url" id="mob-url"></div>' +
                    '<div class="qr-hint">Scan with the iPhone camera</div>';
                w.appendChild(qrWrap);

                function drawQr() {
                    var url = XTV.remote.getQrUrl();
                    if (!url || !window.qrcode) return;
                    try {
                        var q = qrcode(0, 'M');
                        q.addData(url);
                        q.make();
                        var tile = w.querySelector('#mob-qr');
                        if (tile) tile.innerHTML = q.createSvgTag(4, 0);
                        var u = w.querySelector('#mob-url');
                        if (u) u.textContent = url;
                    } catch (e) {}
                }

                function onStatus(s, extra) {
                    var st = w.querySelector('#mob-status');
                    if (!st) return;
                    if (s === 'paired') {
                        st.innerHTML = 'Waiting for your phone — scan the QR below';
                        var p = w.querySelector('#mob-pair');
                        if (p) p.textContent = 'Pair ' + (XTV.remote.getPair() || '');
                        drawQr();
                    } else if (s === 'applied') {
                        st.innerHTML = 'Applied ' + (extra.changes || 0) + ' change' + ((extra.changes === 1) ? '' : 's') + ' from your phone ✓';
                    } else if (s === 'connecting') {
                        st.textContent = 'Looking for the sync server…';
                    } else if (s === 'unavailable') {
                        st.textContent = 'No sync server found. Restart the app with "npm run serve" to enable mobile editing.';
                    } else if (s === 'off') {
                        st.textContent = 'Stopped';
                    }
                    var pr = w.querySelector('#mob-pair');
                    if (pr && s !== 'paired') pr.textContent = XTV.remote.getPair() ? ('Pair ' + XTV.remote.getPair()) : '';
                }

                if (XTV.remote.isRunning()) {
                    XTV.remote.setListener(onStatus);
                    onStatus(XTV.remote.getStatus(), { pair: XTV.remote.getPair(), qrUrl: XTV.remote.getQrUrl() });
                } else {
                    XTV.remote.setListener(onStatus);
                    XTV.remote.start(function () { renderPane(); });
                }
                return w;
            },

            data: function () {
                var w = U.el('div');
                var diag = U.el('div', 'diag');
                var info = {};
                try { info = XTV.xtream.info() || {}; } catch (e) {}
                var si = info.server_info || {}, ui = info.user_info || {};
                var bytes = 0;
                try { bytes = (localStorage.getItem('xtv.v1') || '').length; } catch (e) {}
                diag.innerHTML =
                    '<div class="diag-title">Diagnostics</div>' +
                    '<div>User agent: ' + U.esc(navigator.userAgent.slice(0, 120)) + '</div>' +
                    '<div>Media pipeline: ' + (window.PalmSystem || window.webOS ? 'webOS native + hls.js fallback' : 'browser (hls.js)') + '</div>' +
                    '<div>HLS support: native ' + (!!(document.createElement('video').canPlayType('application/vnd.apple.mpegurl')) ? 'yes' : 'no') +
                    ', hls.js ' + (window.Hls && Hls.isSupported() ? 'yes' : 'no') + '</div>' +
                    '<div>Server: ' + U.esc(si.url || '—') + '</div>' +
                    '<div>Status: ' + U.esc(ui.status || '—') + ' · Connections ' + U.esc(String(ui.active_cons || 0)) + '/' + U.esc(String(ui.max_connections || '?')) + '</div>' +
                    '<div>Settings storage: ' + Math.round(bytes / 1024) + ' KB</div>' +
                    '<div>EPG: ' + (XTV.epg.fullInfo() ? 'full guide loaded' : 'short EPG only') + '</div>' +
                    (XTV.app.log && XTV.app.log.length ?
                        '<div class="diag-title" style="margin-top:14px">Recent errors</div>' +
                        XTV.app.log.map(function (l) { return '<div class="diag-error">' + U.esc(l) + '</div>'; }).join('') : '');
                w.appendChild(diag);
                w.appendChild(rowAction('Clear metadata & catalog cache', function () {
                    XTV.store.clearCache().then(function () { XTV.ui.toast('Cache cleared'); });
                }));
                w.appendChild(rowAction('Clear watch history & progress', function () {
                    XTV.ui.confirm('Clear everything?', 'History, resume positions and watched marks will be erased.', [
                        { label: 'Cancel', onSelect: function (c) { c(); } },
                        { label: 'Clear', primary: true, onSelect: function (c) { c(); XTV.store.clearAllProgress(); XTV.ui.toast('Cleared'); } }
                    ]);
                }));
                w.appendChild(rowAction('Export backup (JSON)', function () {
                    var data = JSON.stringify(XTV.store._state(), null, 2);
                    var blob = new Blob([data], { type: 'application/json' });
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url;
                    a.download = 'solstice-tv-backup-' + new Date().toISOString().slice(0, 10) + '.json';
                    document.body.appendChild(a);
                    try { a.click(); } catch (e) {}
                    setTimeout(function () {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    }, 200);
                    XTV.ui.toast('Backup exported');
                }));
                w.appendChild(rowAction('Import backup (JSON)', function () {
                    var input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json,application/json';
                    input.style.display = 'none';
                    document.body.appendChild(input);
                    input.addEventListener('change', function () {
                        var f = input.files && input.files[0];
                        if (!f) return;
                        var reader = new FileReader();
                        reader.onload = function () {
                            try {
                                var obj = JSON.parse(reader.result);
                                if (!obj.settings || !obj.profiles) throw new Error('Invalid backup');
                                var S = XTV.store._state();
                                Object.assign(S, obj);
                                XTV.store.save();
                                XTV.ui.toast('Backup restored — reloading…');
                                setTimeout(function () { XTV.app.reloadProfiles(); }, 800);
                            } catch (e) {
                                XTV.ui.toast('Import failed: ' + e.message);
                            }
                        };
                        reader.readAsText(f);
                        document.body.removeChild(input);
                    });
                    input.click();
                }));
                return w;
            },

            about: function () {
                var w = U.el('div');
                w.innerHTML =
                    '<div class="about">' +
                    '<div class="login-logo" style="position:static;margin-bottom:16px">▶</div>' +
                    '<h2>Solstice TV for webOS</h2>' +
                    '<p class="set-sub">An Apple TV-style IPTV client for LG smart TVs.<br>Xtream Codes · Live TV + EPG + Catch-up · VOD · Series · TMDB/IMDb metadata · Multi-View<br><br>Sideloaded via webOS Homebrew Channel or Developer Mode. Ships with no content — bring your own playlist.</p>' +
                    '</div>';
                return w;
            }
        };

        function renderPane() {
            pane.innerHTML = '';
            var fn = panes[cur];
            if (fn) pane.appendChild(fn());
            XTV.focus.refresh();
        }

        nav.addEventListener('xfocus', function (e) {
            var sec = e.detail.el._sec;
            if (sec && sec !== cur) { cur = sec; renderNav2(); renderPane(); }
        });
        function renderNav2() {
            U.$$('.settings-nav-item', nav).forEach(function (el) {
                el.classList.toggle('on', el._sec === cur);
            });
        }
        nav.addEventListener('xfselect', function (e) {
            cur = e.detail.el._sec;
            renderNav2(); renderPane();
        });

        renderNav();
        renderPane();
        return root;
    }

    XTV.screens = XTV.screens || {};
    XTV.screens.settings = { build: build };
})();
