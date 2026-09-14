/* Solstice TV — Multi-View: watch up to 4 live channels in a 2×2 grid. */
(function () {
    'use strict';
    var U = XTV.util;

    var tiles = [];        // {ch, video, el}
    var sel = 0;
    var pickerOpen = false;

    function build() {
        var root = U.el('div', 'screen multiview-screen');
        root.innerHTML = '<div class="mv-empty"><div class="mv-icon">▦</div><h2>Multi-View</h2>' +
            '<p class="set-sub">Pick up to 4 channels to watch side by side.<br>Audio follows the highlighted tile. Warning: uses one connection per tile — check your provider limit.</p></div>';
        openPicker(root);
        return root;
    }

    function openPicker(root) {
        pickerOpen = true;
        var cat = XTV.app.catalog;
        var picks = [];
        var list = (cat.live || []);
        var favs = list.filter(function (c) { return XTV.store.isFav('live', c.id); });
        var recent = [];
        var seen = {};
        XTV.store.history().forEach(function (h) {
            if (h.kind === 'live' && !seen[h.id]) { seen[h.id] = 1; recent.push(h); }
        });

        var m = XTV.ui.modal({
            title: 'Multi-View — choose channels (0/4)',
            cls: 'modal-mv',
            body: function (body) {
                var html = '<div class="mv-picked"></div><div class="mv-quick"></div><div class="mv-list x-scroll"></div>';
                body.innerHTML = html;
                var quick = body.querySelector('.mv-quick');
                function chip(label, arr) {
                    if (!arr.length) return;
                    var c = U.el('div', 'btn btn-small', label);
                    c.setAttribute('data-x', '');
                    c.addEventListener('xfselect', function () {
                        picks.length = 0;
                        arr.slice(0, 4).forEach(function (h) {
                            var ch = list.find(function (x) { return x.id === h.id; });
                            if (ch) addPick(ch);
                        });
                    });
                    quick.appendChild(c);
                }
                chip('★ Fill with favorites', favs);
                chip('↺ Fill with recents', recent);
                var listEl = body.querySelector('.mv-list');
                listEl.innerHTML = list.slice(0, 500).map(function (c) {
                    return '<div class="chan-item" data-x data-ci="' + list.indexOf(c) + '">' +
                        '<img class="chan-logo" src="' + U.esc(c.icon || U.placeholder(c.name, 'wide')) + '" onerror="this.style.visibility=\'hidden\'">' +
                        '<div class="chan-info"><div class="chan-name">' + U.esc(c.name) + '</div></div></div>';
                }).join('');
                listEl.addEventListener('xfselect', function (e) {
                    var ci = parseInt(e.detail.el.getAttribute('data-ci'), 10);
                    addPick(list[ci]);
                });
            },
            buttons: [
                { label: 'Cancel', onSelect: function (c) { c(); XTV.app.back(); } },
                { label: 'Start Multi-View', primary: true, onSelect: function (c) {
                    if (!picks.length) { XTV.ui.toast('Pick at least one channel'); return; }
                    c();
                    startGrid(root, picks.slice(0, 4));
                } }
            ]
        });

        function updCount() {
            m.box.querySelector('.modal-title').textContent = 'Multi-View — choose channels (' + picks.length + '/4)';
            var pk = m.box.querySelector('.mv-picked');
            pk.innerHTML = picks.map(function (c) {
                return '<span class="chip chip-on">' + U.esc(c.name) + '</span>';
            }).join('');
        }
        function addPick(ch) {
            if (picks.find(function (x) { return x.id === ch.id; })) { XTV.ui.toast('Already picked'); return; }
            if (picks.length >= 4) { XTV.ui.toast('Maximum 4 channels'); return; }
            picks.push(ch);
            updCount();
        }
        updCount();
    }

    function startGrid(root, chans) {
        root.innerHTML = '';
        var gridEl = U.el('div', 'mv-grid');
        root.appendChild(gridEl);
        tiles = [];
        chans.forEach(function (ch, i) {
            var tile = U.el('div', 'mv-tile');
            tile.innerHTML =
                '<video autoplay muted playsinline></video>' +
                '<div class="mv-overlay"><img src="' + U.esc(ch.icon || '') + '" onerror="this.style.display=\'none\'"><span>' + U.esc(ch.name) + '</span></div>' +
                '<div class="mv-audio">♪</div>';
            gridEl.appendChild(tile);
            var v = tile.querySelector('video');
            var url = XTV.net.streamRelay ? XTV.net.streamRelay(XTV.xtream.liveUrl(ch.id, 'm3u8')) : XTV.xtream.liveUrl(ch.id, 'm3u8');
            if (window.Hls && Hls.isSupported() && !/(PalmSystem|webOS)/.test(navigator.userAgent)) {
                var h = new Hls(); h.loadSource(url); h.attachMedia(v);
                tile._hls = h;
            } else {
                v.src = url; try { v.play(); } catch (e) {}
            }
            tiles.push({ ch: ch, video: v, el: tile });
        });
        sel = 0;
        highlight();

        root._mvKeys = true;
        root.addEventListener('xfkey', function (e) {
            var k = e.detail;
            if (k === 'back' || k === 'stop') return; // handled by app
            if (k === 'left' || k === 'right' || k === 'up' || k === 'down') {
                var col = sel % 2, row = Math.floor(sel / 2);
                if (k === 'left') col = Math.max(0, col - 1);
                if (k === 'right') col = Math.min(1, col + 1);
                if (k === 'up') row = Math.max(0, row - 1);
                if (k === 'down') row = Math.min(Math.ceil((tiles.length - 1) / 2), row + 1);
                var ns = row * 2 + col;
                if (ns < tiles.length) { sel = ns; highlight(); }
            } else if (k === 'ok') {
                var t = tiles[sel];
                stop();
                XTV.app.playLive(t.ch);
            }
        });
    }

    function highlight() {
        tiles.forEach(function (t, i) {
            t.el.classList.toggle('sel', i === sel);
            t.video.muted = i !== sel;
            t.el.querySelector('.mv-audio').style.opacity = i === sel ? 1 : 0.15;
        });
    }

    function stop() {
        tiles.forEach(function (t) {
            if (t._hls) { try { t._hls.destroy(); } catch (e) {} }
            try { t.video.pause(); t.video.removeAttribute('src'); t.video.load(); } catch (e) {}
        });
        tiles = [];
    }

    function active() { return tiles.length > 0; }

    XTV.screens = XTV.screens || {};
    XTV.screens.multiview = { build: build, stop: stop, active: active };
})();
