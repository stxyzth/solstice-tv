/* Solstice TV — Search: native text entry, type filter chips, recent searches. */
(function () {
    'use strict';
    var U = XTV.util;

    function build() {
        var root = U.el('div', 'screen search-screen');
        var value = '';
        var filter = 'all'; // all | live | movies | series

        var chips = U.el('div', 'chip-row x-scroll x-center-x');
        root.appendChild(chips);

        function renderChips() {
            var html = '';
            var opts = [
                { id: 'all', label: 'All' },
                { id: 'live', label: 'Channels' },
                { id: 'movies', label: 'Movies' },
                { id: 'series', label: 'Series' }
            ];
            opts.forEach(function (o) {
                html += '<div class="chip2' + (filter === o.id ? ' on' : '') + '" data-x data-filter="' + o.id + '">' + o.label + '</div>';
            });
            chips.innerHTML = html;
        }
        chips.addEventListener('xfselect', function (e) {
            var f = e.detail.el.getAttribute('data-filter');
            if (f) { filter = f; renderChips(); doSearch(); XTV.focus.setFocused(e.detail.el); }
        });

        var queryWrap = U.el('div', 'search-query');
        queryWrap.setAttribute('data-x', '');
        var input = document.createElement('input');
        input.className = 'search-input';
        input.type = 'text';
        input.placeholder = 'Search channels, movies, series…';
        input.setAttribute('autocomplete', 'off');
        queryWrap.appendChild(input);
        root.appendChild(queryWrap);

        var results = U.el('div', 'search-results');
        root.appendChild(results);

        function saveRecentSearch(q) {
            var s = XTV.store.settings();
            var recent = s.recentSearches || [];
            recent = recent.filter(function (r) { return r !== q; });
            recent.unshift(q);
            if (recent.length > 8) recent.length = 8;
            XTV.store.setSetting('recentSearches', recent);
        }

        function showRecents() {
            var recent = XTV.store.settings().recentSearches || [];
            if (!recent.length) {
                results.innerHTML = '<div class="empty-note">Type to search your library</div>';
                return;
            }
            results.innerHTML = '<div class="row"><div class="row-head"><h2>Recent Searches</h2></div></div>';
            var wrap = results.querySelector('.row');
            recent.forEach(function (q) {
                var el = U.el('div', 'chip2');
                el.setAttribute('data-x', '');
                el.textContent = q;
                el.addEventListener('xfselect', function () {
                    input.value = q;
                    value = q;
                    doSearch();
                });
                wrap.appendChild(el);
            });
        }

        var doSearch = U.debounce(function () {
            var q = value.trim().toLowerCase();
            var cat = XTV.app.catalog;
            results.innerHTML = '';
            if (q.length < 2) { showRecents(); return; }
            saveRecentSearch(value.trim());
            var live = (filter === 'all' || filter === 'live') ? (cat.live || []).filter(function (c) { return c.name.toLowerCase().indexOf(q) !== -1; }).slice(0, 24) : [];
            var vod = (filter === 'all' || filter === 'movies') ? (cat.vod || []).filter(function (c) { return c.name.toLowerCase().indexOf(q) !== -1; }).slice(0, 40) : [];
            var ser = (filter === 'all' || filter === 'series') ? (cat.series || []).filter(function (c) { return c.name.toLowerCase().indexOf(q) !== -1; }).slice(0, 40) : [];
            if (!live.length && !vod.length && !ser.length) {
                results.innerHTML = '<div class="empty-note">No results for "' + U.esc(value) + '"</div>';
                return;
            }
            if (live.length) {
                results.appendChild(XTV.ui.buildRow({
                    title: 'Channels (' + live.length + ')',
                    items: live.map(function (c) { return { id: c.id, title: c.name, icon: c.icon, num: c.num, _item: c }; }),
                    kind: 'channel',
                    onSelect: function (it) { XTV.app.playLive(it._item); }
                }));
            }
            if (vod.length) {
                results.appendChild(XTV.ui.buildRow({
                    title: 'Movies (' + vod.length + ')',
                    items: vod.map(function (c) { return { id: c.id, title: c.name, icon: c.icon, _item: c }; }),
                    onSelect: function (it) { XTV.app.openMovieDetail(it._item); }
                }));
            }
            if (ser.length) {
                results.appendChild(XTV.ui.buildRow({
                    title: 'Series (' + ser.length + ')',
                    items: ser.map(function (c) { return { id: c.id, title: c.name, icon: c.icon, _item: c }; }),
                    onSelect: function (it) { XTV.app.openSeriesDetail(it._item); }
                }));
            }
        }, 250);

        input.addEventListener('input', function () {
            value = input.value;
            doSearch();
        });
        input.addEventListener('keydown', function (e) {
            if (e.keyCode === 13) { e.preventDefault(); try { input.blur(); } catch (er) {} }
        });
        queryWrap.addEventListener('xfselect', function () {
            setTimeout(function () { try { input.focus(); } catch (er) {} }, 0);
        });

        renderChips();
        showRecents();
        return root;
    }

    XTV.screens = XTV.screens || {};
    XTV.screens.search = { build: build };
})();
