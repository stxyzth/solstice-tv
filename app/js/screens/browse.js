/* Solstice TV — Movies & Series browsers: category chips, sort, virtualized grid.
   One shared implementation for both tabs. */
(function () {
    'use strict';
    var U = XTV.util;

    function buildBrowser(kind) {
        // kind: 'movie' | 'series'
        return function () {
            var root = U.el('div', 'screen browse-screen');
            var cat = XTV.app.catalog;
            var items = kind === 'movie' ? (cat.vod || []) : (cat.series || []);
            var cats = kind === 'movie' ? (cat.vodCats || []) : (cat.serCats || []);
            cats = cats.filter(function (c) {
                return !(XTV.store.settings().hideAdult && XTV.xtream.isAdult(c.name));
            });

            var curCat = 'all';
            var sort = 'added';

            var chips = U.el('div', 'chip-row x-scroll x-center-x');
            root.appendChild(chips);
            var gridWrap = U.el('div', 'browse-grid');
            root.appendChild(gridWrap);
            var count = U.el('div', 'browse-count');
            root.appendChild(count);

            function renderChips() {
                var html = '<div class="chip2' + (curCat === 'all' ? ' on' : '') + '" data-x data-cat="all">All</div>';
                html += '<div class="chip2' + (curCat === 'fav' ? ' on' : '') + '" data-x data-cat="fav">★ Favorites</div>';
                cats.forEach(function (c) {
                    html += '<div class="chip2' + (curCat === c.id ? ' on' : '') + '" data-x data-cat="' + U.esc(c.id) + '">' + U.esc(c.name) + '</div>';
                });
                html += '<div class="chip2 chip-sort" data-x data-cat="sort">Sort: ' + (sort === 'added' ? 'Recently Added' : sort === 'name' ? 'Name' : 'Rating') + '</div>';
                chips.innerHTML = html;
            }

            var grid = null;
            function currentItems() {
                var list = items.filter(function (x) {
                    if (curCat === 'fav') return XTV.store.isFav(kind, x.id);
                    if (curCat !== 'all' && x.catId !== curCat) return false;
                    return true;
                });
                if (sort === 'added') list = list.slice().sort(function (a, b) { return b.added - a.added; });
                else if (sort === 'name') list = list.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
                else if (sort === 'rating') list = list.slice().sort(function (a, b) { return (b.rating || 0) - (a.rating || 0); });
                return list;
            }

            function renderGrid() {
                var list = currentItems();
                count.textContent = list.length + ' titles';
                if (grid) grid.setItems(list.map(function (x) {
                    return {
                        id: x.id, title: x.name, icon: x.icon, rating: x.rating,
                        sub: x.year || '', badge: x.rating > 0 ? '★ ' + x.rating.toFixed(1) : '', _item: x
                    };
                }));
                else {
                    grid = new XTV.ui.Grid({
                        items: list.map(function (x) {
                            return { id: x.id, title: x.name, icon: x.icon, rating: x.rating, sub: x.year || '', badge: x.rating > 0 ? '★ ' + x.rating.toFixed(1) : '', _item: x };
                        }),
                        cols: 7, rowH: 320,
                        onSelect: function (it) {
                            if (kind === 'movie') XTV.app.openMovieDetail(it._item);
                            else XTV.app.openSeriesDetail(it._item);
                        },
                        onFocus: function (it) { XTV.app.ambient(it.icon); }
                    });
                    gridWrap.appendChild(grid.root);
                }
                if (!list.length) gridWrap.innerHTML = '<div class="empty-note">Nothing here yet.</div>';
            }

            chips.addEventListener('xfselect', function (e) {
                var c = e.detail.el.getAttribute('data-cat');
                if (c === 'sort') {
                    sort = sort === 'added' ? 'name' : sort === 'name' ? 'rating' : 'added';
                    renderChips(); renderGrid();
                    return;
                }
                curCat = c;
                renderChips(); renderGrid();
                XTV.focus.setFocused(e.detail.el);
            });

            renderChips();
            renderGrid();
            return root;
        };
    }

    XTV.screens = XTV.screens || {};
    XTV.screens.movies = { build: buildBrowser('movie') };
    XTV.screens.series = { build: buildBrowser('series') };
})();
