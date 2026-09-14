/* Solstice TV — Live TV: timeline guide (channels × time), channel grid, catch-up. */
(function () {
    'use strict';
    var U = XTV.util;

    var PX_PER_HOUR = 280;
    var CHAN_W = 300;
    var MAX_GUIDE_ROWS = 150;

    function build() {
        var root = U.el('div', 'screen live-screen');
        var cat = XTV.app.catalog;
        var viewMode = 'guide';
        var favOnly = false;
        var curCat = 'all';
        var channels = allChannels();
        var nowTimer = null;

        function allChannels() { return (XTV.app.catalog.live || []); }
        channels = allChannels();

        /* ---------- preview panel ---------- */
        root.innerHTML =
            '<div class="live-preview"><div class="live-preview-info">' +
            '<img class="live-preview-logo" alt=""><div class="live-preview-txt">' +
            '<div class="live-preview-name">&nbsp;</div>' +
            '<div class="live-preview-epg"><span class="live-now"></span><span class="live-next"></span></div>' +
            '<div class="live-preview-desc"></div>' +
            '<div class="live-preview-bar"><i></i></div>' +
            '</div></div>' +
            '<div class="live-zapbuf"></div></div>';

        var chips = U.el('div', 'chip-row x-scroll x-center-x');
        root.appendChild(chips);

        var guideWrap = U.el('div', 'guide-wrap');
        var gridWrap = U.el('div', 'live-grid-wrap');
        gridWrap.style.display = 'none';
        root.appendChild(guideWrap);
        root.appendChild(gridWrap);

        /* ---------- shared helpers ---------- */
        function catsList() {
            var list = [{ id: 'all', name: 'All Channels' }, { id: 'fav', name: '★ Favorites' }];
            return list.concat((cat.liveCats || []).filter(function (c) {
                return !(XTV.store.settings().hideAdult && XTV.xtream.isAdult(c.name));
            }));
        }

        function filtered() {
            return channels.filter(function (c) {
                if (favOnly && !XTV.store.isFav('live', c.id)) return false;
                if (curCat !== 'all' && c.catId !== curCat) return false;
                return true;
            });
        }

        function renderChips() {
            var html =
                '<div class="chip2' + (viewMode === 'guide' ? ' on' : '') + '" data-x data-view="guide">Guide</div>' +
                '<div class="chip2' + (viewMode === 'grid' ? ' on' : '') + '" data-x data-view="grid">Channels</div>';
            html += '<div class="chip2" data-x data-cat="all"' + (curCat === 'all' && !favOnly ? ' style="background:#fff;color:#000;border-color:#fff"' : '') + '>All</div>';
            html += '<div class="chip2" data-x data-cat="fav"' + (favOnly ? ' style="background:#fff;color:#000;border-color:#fff"' : '') + '>★ Favorites</div>';
            catsList().slice(2).forEach(function (c) {
                html += '<div class="chip2" data-x data-cat="' + U.esc(c.id) + '"' + (curCat === c.id && !favOnly ? ' style="background:#fff;color:#000;border-color:#fff"' : '') + '>' + U.esc(c.name) + '</div>';
            });
            chips.innerHTML = html;
        }

        chips.addEventListener('xfselect', function (e) {
            var v = e.detail.el.getAttribute('data-view');
            if (v) {
                viewMode = v;
                renderChips();
                showView(false);
                XTV.focus.setFocused(e.detail.el);
                return;
            }
            var c = e.detail.el.getAttribute('data-cat');
            if (c === 'fav') favOnly = !favOnly;
            else { favOnly = false; curCat = c; }
            renderChips();
            showView(true);
            XTV.focus.setFocused(e.detail.el);
        });

        function showView(refocusContent) {
            guideWrap.style.display = viewMode === 'guide' ? '' : 'none';
            gridWrap.style.display = viewMode === 'grid' ? '' : 'none';
            if (viewMode === 'guide') {
                guideApi.render(refocusContent);
            } else {
                gridApi.render(refocusContent);
            }
        }

        /* ============================================================
           GUIDE — timeline EPG (channels × time), now-line, catch-up
           ============================================================ */
        var guideApi = (function () {
            var winStart, winEnd;
            var guideData = {};      // chId -> programs (full guide or short-EPG fallback)
            var shortPending = {};
            var el = null, lanes = null, gtbi = null, gli = null, scroller = null, nowline = null;

            function floorHalfHour(t) {
                var m = 30 * 60 * 1000;
                return Math.floor(t / m) * m;
            }
            function resetWindow() {
                winStart = floorHalfHour(Date.now() - 30 * 60 * 1000);
                winEnd = winStart + 6 * 3600 * 1000;
            }

            function programsFor(ch) {
                if (guideData[ch.id]) return guideData[ch.id];
                var full = XTV.epg.getPrograms(ch);
                if (full.length) {
                    guideData[ch.id] = full;
                    return full;
                }
                if (!shortPending[ch.id]) {
                    shortPending[ch.id] = true;
                    XTV.epg.getShort(ch.id, 14).then(function (list) {
                        guideData[ch.id] = list;
                        shortPending[ch.id] = false;
                        if (el && el.isConnected) render(true);
                    });
                }
                return guideData[ch.id] || [];
            }

            function clip(progs) {
                var out = [];
                for (var i = 0; i < progs.length; i++) {
                    var p = progs[i];
                    var s = p.start.getTime(), e = p.stop.getTime();
                    if (e <= winStart || s >= winEnd) continue;
                    out.push({
                        title: p.title || 'Program',
                        desc: p.desc || '',
                        start: s, stop: e,
                        cs: Math.max(s, winStart), ce: Math.min(e, winEnd)
                    });
                }
                return out;
            }

            function statusOf(p) {
                var now = Date.now();
                if (p.stop <= now) return 'past';
                if (p.start <= now) return 'onnow';
                return 'future';
            }

            function render(keepFocus) {
                var prevFocused = keepFocus && XTV.focus.current();
                var prevKey = prevFocused && prevFocused._pgm ? prevFocused.getAttribute('data-pk') : null;
                var prevScroll = scroller ? { x: scroller.scrollLeft, y: scroller.scrollTop } : null;

                var list = filtered().slice(0, MAX_GUIDE_ROWS);
                var canvasW = Math.ceil((winEnd - winStart) / 3600000 * PX_PER_HOUR);

                if (!el) {
                    el = U.el('div', 'guide');
                    el.innerHTML =
                        '<div class="guide-corner"><span class="guide-clock"></span></div>' +
                        '<div class="guide-timebar"><div class="gtb-inner"></div></div>' +
                        '<div class="guide-left"><div class="guide-left-inner"></div></div>' +
                        '<div class="guide-scroll x-scroll"><div class="guide-lanes"></div></div>';
                    guideWrap.appendChild(el);
                    lanes = el.querySelector('.guide-lanes');
                    gtbi = el.querySelector('.gtb-inner');
                    gli = el.querySelector('.guide-left-inner');
                    scroller = el.querySelector('.guide-scroll');

                    scroller.addEventListener('scroll', syncOverlay);
                    scroller.addEventListener('xfselect', function (e) {
                        var pgm = e.detail.el.closest('.pgm');
                        if (pgm && pgm._ch) activate(pgm._ch, pgm._prog);
                    });
                    scroller.addEventListener('xfocus', function (e) {
                        var pgm = e.detail.el.closest('.pgm');
                        if (pgm && pgm._ch) previewProg(pgm._ch, pgm._prog);
                    });
                    scroller.addEventListener('xfedge', function (e) {
                        if (e.detail.dir === 'right') extend(2);
                        else if (e.detail.dir === 'left') extend(-2);
                    });
                    nowTimer = setInterval(updateNow, 60000);
                }

                var lanesHtml = '<div class="guide-now"></div>', leftHtml = '';
                var blockData = {};   // pk -> {ch, prog}
                for (var r = 0; r < list.length; r++) {
                    var ch = list[r];
                    leftHtml += '<div class="gli-row"><img class="gli-logo" src="' + U.esc(ch.icon || U.placeholder(ch.name, 'wide')) + '" onerror="this.style.visibility=\'hidden\'">' +
                        '<div class="gli-txt"><div class="gli-name">' + U.esc(ch.name) + '</div>' +
                        '<div class="gli-num">' + (ch.num != null ? 'CH ' + ch.num : '') + '</div></div></div>';
                    lanesHtml += '<div class="guide-chrow">';
                    var progs = clip(programsFor(ch));
                    if (!progs.length) {
                        lanesHtml += '<div class="pgm pgm-empty" style="left:0;width:' + canvasW + 'px"><div class="pgm-title">No guide data</div></div>';
                    }
                    for (var i = 0; i < progs.length; i++) {
                        var p = progs[i];
                        var left = Math.max(0, (p.cs - winStart) / 3600000 * PX_PER_HOUR);
                        var width = Math.max(60, (p.ce - p.cs) / 3600000 * PX_PER_HOUR - 3);
                        var pk = String(ch.id) + '@' + p.start;
                        blockData[pk] = { ch: ch, prog: { title: p.title, desc: p.desc, start: p.start, stop: p.stop } };
                        lanesHtml += '<div class="pgm ' + statusOf(p) + '" data-x style="left:' + left + 'px;width:' + width + 'px"' +
                            ' data-pk="' + U.esc(pk) + '">' +
                            '<div class="pgm-title">' + U.esc(p.title) + '</div>' +
                            '<div class="pgm-time">' + U.fmtClock(p.start) + ' – ' + U.fmtClock(p.stop) + '</div>' +
                            '</div>';
                    }
                    lanesHtml += '</div>';
                }
                if (channels.length > MAX_GUIDE_ROWS) {
                    lanesHtml += '<div class="guide-note">Showing the first ' + MAX_GUIDE_ROWS + ' channels — filter by category to see more</div>';
                }
                lanes.innerHTML = lanesHtml;
                nowline = lanes.querySelector('.guide-now');
                gli.innerHTML = leftHtml;

                var blocks = lanes.querySelectorAll('.pgm[data-pk]');
                for (var b = 0; b < blocks.length; b++) {
                    var bd = blockData[blocks[b].getAttribute('data-pk')];
                    if (bd) { blocks[b]._ch = bd.ch; blocks[b]._prog = bd.prog; }
                }

                // time bar ticks (every 30 min)
                var ticks = '';
                var t = floorHalfHour(winStart);
                while (t <= winEnd) {
                    var off = (t - winStart) / 3600000 * PX_PER_HOUR;
                    ticks += '<div class="gtb-tick" style="left:' + off + 'px"><span>' + U.fmtClock(t) + '</span></div>';
                    t += 30 * 60 * 1000;
                }
                gtbi.style.width = canvasW + 'px';
                gtbi.innerHTML = ticks;

                lanes.style.width = canvasW + 'px';
                if (prevScroll) { scroller.scrollLeft = prevScroll.x; scroller.scrollTop = prevScroll.y; }
                syncOverlay();
                updateNow();

                var target = null;
                if (prevKey) {
                    try { target = lanes.querySelector('[data-pk="' + prevKey + '"]'); } catch (er) { target = null; }
                }
                if (!target) {
                    var onnow = lanes.querySelectorAll('.pgm.onnow');
                    target = onnow[0] || lanes.querySelector('.pgm[data-x]');
                }
                if (target) XTV.focus.setFocused(target);
                else if (list.length) XTV.focus.refresh();
            }

            function syncOverlay() {
                if (!scroller) return;
                gtbi.style.webkitTransform = gtbi.style.transform = 'translateX(' + (-scroller.scrollLeft) + 'px)';
                gli.style.webkitTransform = gli.style.transform = 'translateY(' + (-scroller.scrollTop) + 'px)';
            }

            function updateNow() {
                if (!el) return;
                var clock = el.querySelector('.guide-clock');
                if (clock) clock.textContent = U.fmtClock(Date.now());
                if (!nowline) return;
                var off = (Date.now() - winStart) / 3600000 * PX_PER_HOUR;
                var span = (winEnd - winStart) / 3600000 * PX_PER_HOUR;
                if (off < 0 || off > span) nowline.style.display = 'none';
                else { nowline.style.display = ''; nowline.style.left = off + 'px'; }
            }

            function extend(hours) {
                var delta = hours * 3600 * 1000;
                var oldStart = winStart;
                winStart += delta; winEnd += delta;
                if (winEnd <= Date.now() + 1800 * 1000) resetWindow();
                render(true);
                if (hours < 0) {
                    var shift = (oldStart - winStart) / 3600000 * PX_PER_HOUR;
                    scroller.scrollLeft += shift;
                    syncOverlay();
                }
            }

            function jumpToNow() {
                resetWindow();
                render(true);
                scroller.scrollLeft = Math.max(0, (Date.now() - winStart) / 3600000 * PX_PER_HOUR - 200);
                syncOverlay();
                XTV.ui.toast('Jumped to now');
            }

            function activate(ch, p) {
                var now = Date.now();
                if (p.start <= now && now < p.stop) {
                    var idx = filtered().indexOf(ch);
                    XTV.app.playLive(ch, filtered(), idx);
                } else if (p.stop <= now) {
                    XTV.app.playCatchup(ch, { start: new Date(p.start), stop: new Date(p.stop), title: p.title });
                } else {
                    XTV.ui.modal({
                        title: p.title,
                        cls: 'modal-narrow',
                        body: '<p class="modal-dim" style="margin-top:0">' + U.esc(ch.name) + ' · ' + U.fmtClock(p.start) + ' – ' + U.fmtClock(p.stop) + '</p>' +
                            '<p class="modal-text">' + U.esc(p.desc || 'No description available.') + '</p>',
                        buttons: [{ label: 'Close', primary: true, onSelect: function (c) { c(); } }]
                    });
                }
            }

            resetWindow();

            return {
                render: render,
                jumpToNow: jumpToNow,
                resetData: function () { guideData = {}; shortPending = {}; },
                destroy: function () { if (nowTimer) clearInterval(nowTimer); nowTimer = null; }
            };
        })();

        /* ============================================================
           CHANNELS GRID (classic browse view)
           ============================================================ */
        var gridApi = (function () {
            function render(refocusContent) {
                var items = filtered().map(function (c, i) {
                    return { id: c.id, title: c.name, icon: c.icon, num: c.num, _ch: c, _idx: i };
                });
                gridWrap.innerHTML = '';
                if (!items.length) {
                    gridWrap.innerHTML = '<div class="empty-note">No channels here.</div>';
                    return;
                }
                var grid = new XTV.ui.Grid({
                    items: items, cols: 4, rowH: 210, kind: 'channel',
                    onSelect: function (it) { XTV.app.playLive(it._ch, filtered(), it._idx); },
                    onFocus: function (it) { previewCh(it._ch); }
                });
                gridWrap.appendChild(grid.root);
                if (refocusContent) {
                    var first = gridWrap.querySelector('[data-x]');
                    if (first) XTV.focus.setFocused(first);
                }
            }
            return { render: render };
        })();

        /* ---------- preview panel (both views) ---------- */
        var previewChRef = null;
        function setPreviewHeader(ch) {
            var logo = root.querySelector('.live-preview-logo');
            logo.style.visibility = ch.icon ? 'visible' : 'hidden';
            if (ch.icon) logo.src = ch.icon;
            root.querySelector('.live-preview-name').textContent = ch.name;
            XTV.app.ambient(ch.icon);
        }
        function previewCh(ch) {
            if (previewChRef === ch) return;
            previewChRef = ch;
            setPreviewHeader(ch);
            root.querySelector('.live-now').textContent = 'Loading guide…';
            root.querySelector('.live-next').textContent = '';
            root.querySelector('.live-preview-desc').textContent = '';
            root.querySelector('.live-preview-bar i').style.width = '0%';
            XTV.epg.nowNext(ch).then(function (nn) {
                if (previewChRef !== ch) return;
                if (nn && nn.now) {
                    var pct = nn.now.stop > nn.now.start ? ((Date.now() - nn.now.start) / (nn.now.stop - nn.now.start)) * 100 : 0;
                    root.querySelector('.live-now').innerHTML = '<b>' + U.fmtClock(nn.now.start) + '–' + U.fmtClock(nn.now.stop) + '</b> ' + U.esc(nn.now.title);
                    root.querySelector('.live-next').textContent = nn.next ? 'Next ' + U.fmtClock(nn.next.start) + ' ' + nn.next.title : '';
                    root.querySelector('.live-preview-bar i').style.width = U.clamp(pct, 0, 100) + '%';
                } else {
                    root.querySelector('.live-now').textContent = 'No EPG data';
                }
            });
        }

        function previewProg(ch, p) {
            previewChRef = ch;
            setPreviewHeader(ch);
            var now = Date.now();
            var st = p.stop <= now ? 'past' : (p.start <= now ? 'onnow' : 'future');
            root.querySelector('.live-now').innerHTML = '<b>' + U.fmtClock(p.start) + ' – ' + U.fmtClock(p.stop) + '</b> ' + U.esc(p.title) +
                (st === 'past' ? ' &nbsp;<span class="epg-cu">CATCH-UP</span>' : st === 'onnow' ? ' &nbsp;<span class="epg-on">ON NOW</span>' : '');
            root.querySelector('.live-next').textContent = '';
            root.querySelector('.live-preview-desc').textContent = (p.desc || '').slice(0, 170);
            var pct = p.stop > p.start ? U.clamp((now - p.start) / (p.stop - p.start) * 100, 0, 100) : 0;
            root.querySelector('.live-preview-bar i').style.width = (st === 'onnow' ? pct : 0) + '%';
        }

        /* ---------- screen-level keys: colors + number zap ---------- */
        var zapBuf = '', zapT = null;
        function zapDigit(d) {
            zapBuf += d;
            var zb = root.querySelector('.live-zapbuf');
            zb.textContent = zapBuf;
            zb.classList.add('show');
            clearTimeout(zapT);
            zapT = setTimeout(function () {
                var n = parseInt(zapBuf, 10);
                var list = filtered();
                var idx = -1;
                for (var i = 0; i < list.length; i++) if (list[i].num === n) { idx = i; break; }
                zapBuf = '';
                zb.classList.remove('show');
                if (idx >= 0) XTV.app.playLive(list[idx], list, idx);
                else XTV.ui.toast('No channel ' + n);
            }, 1100);
        }

        root.addEventListener('xfkey', function (e) {
            var k = e.detail;
            if (k >= '0' && k <= '9') return zapDigit(k);
            if (k === 'red') {
                favOnly = !favOnly;
                renderChips(); showView(true);
                XTV.ui.toast(favOnly ? 'Showing favorites' : 'Showing all channels');
            } else if (k === 'yellow') {
                if (viewMode === 'guide') guideApi.jumpToNow();
            } else if (k === 'blue') {
                XTV.app.showMultiview();
            }
        });

        root._onDestroy = function () { guideApi.destroy(); clearTimeout(zapT); };

        // when the full guide arrives, drop any short-EPG fallback data and redraw
        XTV.epg.loadFull().then(function (g) {
            if (g && guideWrap.isConnected) {
                guideApi.resetData();
                guideApi.render(true);
            }
        });

        renderChips();
        showView(false);
        return root;
    }

    XTV.screens = XTV.screens || {};
    XTV.screens.live = { build: build };
})();
