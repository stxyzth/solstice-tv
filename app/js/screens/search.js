/* Solstice TV — Search: native text entry (TV system keyboard) + live results. */
(function () {
    'use strict';
    var U = XTV.util;

    function build() {
        var root = U.el('div', 'screen search-screen');
        var value = '';

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

        var doSearch = U.debounce(function () {
            var q = value.trim().toLowerCase();
            var cat = XTV.app.catalog;
            results.innerHTML = '';
            if (q.length < 2) return;
            var live = (cat.live || []).filter(function (c) { return c.name.toLowerCase().indexOf(q) !== -1; }).slice(0, 24);
            var vod = (cat.vod || []).filter(function (c) { return c.name.toLowerCase().indexOf(q) !== -1; }).slice(0, 40);
            var ser = (cat.series || []).filter(function (c) { return c.name.toLowerCase().indexOf(q) !== -1; }).slice(0, 40);
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
        // OK on the field opens the TV system keyboard
        queryWrap.addEventListener('xfselect', function () {
            setTimeout(function () { try { input.focus(); } catch (er) {} }, 0);
        });

        return root;
    }

    XTV.screens = XTV.screens || {};
    XTV.screens.search = { build: build };
})();
