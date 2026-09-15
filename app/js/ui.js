/* Solstice TV — shared UI components: cards, rows, virtual grid, modal, toast,
   spinner, on-screen keyboard, PIN pad. */
(function () {
    'use strict';
    var U = XTV.util;

    var uidSeq = 0;

    /* ================= CARDS ================= */

    function cardEl(item, kind) {
        // kind: 'poster' (2:3), 'wide' (16:9), 'channel' (logo + name)
        kind = kind || 'poster';
        var el = U.el('div', 'card card-' + kind);
        el.setAttribute('data-x', '');
        var imgSrc = item.icon || item.poster || item.img || '';
        var ph = U.placeholder(item.title || item.name || '?', kind === 'poster' ? 'poster' : 'wide');
        var badge = item.badge ? '<div class="card-badge">' + U.esc(item.badge) + '</div>' : '';
        var progress = '';
        if (item.progress > 0 && item.progress < 100) {
            progress = '<div class="card-progress"><i style="width:' + item.progress + '%"></i></div>';
        }
        if (kind === 'channel') {
            el.innerHTML =
                '<div class="card-imgwrap"><img loading-src="' + U.esc(imgSrc || ph) + '" src="' + U.esc(imgSrc || ph) + '" onerror="this.src=\'' + ph.replace(/'/g, '%27') + '\'" draggable="false">' + badge + progress + '</div>' +
                '<div class="card-label"><span class="card-num">' + (item.num != null ? item.num : '') + '</span>' + U.esc(item.title || item.name) + '</div>' +
                '<div class="card-sub">' + U.esc(item.sub || '') + '</div>';
        } else {
            el.innerHTML =
                '<div class="card-imgwrap"><img src="' + U.esc(imgSrc || ph) + '" onerror="this.src=\'' + ph.replace(/'/g, '%27') + '\'" draggable="false">' + badge + progress +
                '</div>' +
                '<div class="card-label">' + U.esc(item.title || item.name) + '</div>' +
                (item.sub ? '<div class="card-sub">' + U.esc(item.sub) + '</div>' : '');
        }
        el._item = item;
        return el;
    }

    /* ================= ROWS ================= */

    function buildRow(opts) {
        // opts: {title, items, kind, onSelect(item, el), onFocus(item, el), cardFn(item)->el}
        var sec = U.el('section', 'row');
        var head = U.el('div', 'row-head');
        if (opts.titleHtml) head.innerHTML = '<h2>' + opts.titleHtml + '</h2>';
        else head.innerHTML = '<h2>' + U.esc(opts.title || '') + '</h2>';
        sec.appendChild(head);
        var scroller = U.el('div', 'row-scroll x-scroll x-center-x');
        sec.appendChild(scroller);
        var items = opts.items || [];
        for (var i = 0; i < items.length; i++) {
            var el = opts.cardFn ? opts.cardFn(items[i]) : cardEl(items[i], opts.kind);
            el._idx = i;
            scroller.appendChild(el);
        }
        scroller.addEventListener('xfselect', function (e) {
            var card = e.detail.el.closest('.card');
            if (card && opts.onSelect) opts.onSelect(card._item, card);
        });
        if (opts.onFocus) {
            scroller.addEventListener('xfocus', function (e) {
                var card = e.detail.el.closest('.card');
                if (card) opts.onFocus(card._item, card);
            });
        }
        sec._scroller = scroller;
        return sec;
    }

    /* ================= VIRTUAL GRID ================= */

    function Grid(opts) {
        // opts: {items, cols, rowH, cardFn, onSelect, onFocus, emptyMsg}
        this.items = opts.items || [];
        this.cols = opts.cols || 6;
        this.rowH = opts.rowH || 300;   // card + label, px @1080
        this.cardFn = opts.cardFn || function (it) { return cardEl(it, opts.kind || 'poster'); };
        this.onSelect = opts.onSelect;
        this.onFocus = opts.onFocus;
        this.rendered = new Map ? new Map() : null;
        this._map = {};
        this._first = -1; this._last = -1;
        this._build();
    }

    Grid.prototype._build = function () {
        this.root = U.el('div', 'vgrid');
        this.spacer = U.el('div', 'vgrid-spacer');
        this.win = U.el('div', 'vgrid-win');
        this.rows = Math.ceil(this.items.length / this.cols);
        this.spacer.style.height = (this.rows * this.rowH + 20) + 'px';
        this.root.appendChild(this.spacer);
        this.root.appendChild(this.win);
        this.root.classList.add('x-scroll');
        var self = this;
        this.root.addEventListener('scroll', U.throttle(function () { self.renderWindow(); }, 60));
        this.root.addEventListener('xfselect', function (e) {
            var card = e.detail.el.closest('.card');
            if (card && self.onSelect) self.onSelect(card._item, card);
        });
        this.root.addEventListener('xfocus', function (e) {
            var card = e.detail.el.closest('.card');
            if (card) {
                if (self.onFocus) self.onFocus(card._item, card);
            }
        });
        this.root.addEventListener('xfedge', function (e) {
            if (e.detail.dir === 'down') {
                var below = self._last + 1;
                if (below < self.rows) { self.renderWindow(below); self._focusRowCol(below, 0); }
            }
        });
        this.renderWindow();
    };

    Grid.prototype._focusRowCol = function (row, col) {
        var idx = U.clamp(row * this.cols + col, 0, this.items.length - 1);
        var el = this._map[idx];
        if (el) XTV.focus.setFocused(el);
    };

    Grid.prototype.renderWindow = function (forceRow) {
        var st = Math.max(0, this.root.scrollTop - 10);   // account for top padding
        var vh = this.root.clientHeight || 900;
        var firstRow = Math.max(0, Math.floor(st / this.rowH) - 2);
        var lastRow = Math.min(this.rows - 1, Math.ceil((st + vh) / this.rowH) + 2);
        if (forceRow != null) {
            firstRow = Math.max(0, Math.min(firstRow, forceRow - 2));
            lastRow = Math.max(lastRow, forceRow);
        }
        if (forceRow != null && forceRow + 2 < firstRow) { firstRow = forceRow; lastRow = forceRow + 4; }
        if (firstRow === this._first && lastRow === this._last && !forceRow) return;
        this._first = firstRow; this._last = lastRow;
        var self = this;
        // preserve focus across window rebuilds (scroll/edge) so focus never
        // lands on a detached node or escapes to the tab bar
        var prev = XTV.focus.current();
        var prevInGrid = prev && this.root.contains(prev);
        var prevIdx = (prevInGrid && prev._idx !== undefined) ? prev._idx : null;
        this.win.innerHTML = '';
        this._map = {};
        this.win.style.transform = 'translateY(' + (firstRow * this.rowH + 10) + 'px)';
        var frag = document.createDocumentFragment();
        for (var r = firstRow; r <= lastRow; r++) {
            for (var c = 0; c < this.cols; c++) {
                var idx = r * this.cols + c;
                if (idx >= this.items.length) break;
                var el = this.cardFn(this.items[idx], idx);
                el._idx = idx;
                el.style.position = 'absolute';
                el.style.left = (c * (100 / this.cols)) + '%';
                el.style.top = ((r - firstRow) * this.rowH) + 'px';
                el.style.width = 'calc(' + (100 / this.cols) + '% - 24px)';
                this._map[idx] = el;
                frag.appendChild(el);
            }
        }
        this.win.appendChild(frag);
        this._lastCol = 0;
        if (prevIdx !== null) {
            var pe = this._map[Math.min(prevIdx, this.items.length - 1)];
            if (pe) { XTV.focus.setFocused(pe); return; }
        }
        // if previous focus was inside this grid but no prevIdx matched,
        // restore to first visible card to prevent focus escaping
        if (prevInGrid) {
            var firstKey = Object.keys(this._map)[0];
            if (firstKey != null) XTV.focus.setFocused(this._map[firstKey]);
        }
    };

    Grid.prototype.focusIndex = function (i) {
        var idx = U.clamp(i, 0, this.items.length - 1);
        var row = Math.floor(idx / this.cols);
        if (row < this._first || row > this._last) this.renderWindow(row);
        var el = this._map[idx];
        if (el) XTV.focus.setFocused(el);
    };

    Grid.prototype.setItems = function (items) {
        this.items = items || [];
        this.rows = Math.ceil(this.items.length / this.cols);
        this.spacer.style.height = (this.rows * this.rowH + 20) + 'px';
        this._first = -1; this._last = -1;
        this.renderWindow();
    };

    /* ================= MODAL ================= */

    var modalStack = [];
    function topModal() {
        if (!modalStack.length) return null;
        var backdrop = modalStack[modalStack.length - 1];
        return { close: function () { backdrop._close(); } };
    }

    function modal(opts) {
        // opts: {title, cls, body(el)->void | html, buttons:[{label, primary, onSelect(close)}],
        //        onClose, focusEl}
        var backdrop = U.el('div', 'modal-backdrop');
        var box = U.el('div', 'modal ' + (opts.cls || ''));
        box.setAttribute('data-x', '');
        var close = function (silent) {
            if (backdrop._closed) return;
            backdrop._closed = true;
            var si = modalStack.indexOf(backdrop);
            if (si !== -1) modalStack.splice(si, 1);
            backdrop.classList.remove('show');
            setTimeout(function () {
                if (backdrop.parentElement) backdrop.parentElement.removeChild(backdrop);
            }, 180);
            XTV.focus.popRoot();
            if (!silent && opts.onClose) opts.onClose();
        };
        backdrop._close = close;
        var html = '';
        if (opts.title) html += '<h3 class="modal-title">' + U.esc(opts.title) + '</h3>';
        box.innerHTML = html + '<div class="modal-body"></div>' +
            (opts.buttons && opts.buttons.length ? '<div class="modal-buttons"></div>' : '');
        backdrop.appendChild(box);
        document.body.appendChild(backdrop);
        var body = box.querySelector('.modal-body');
        if (typeof opts.body === 'string') body.innerHTML = opts.body;
        else if (opts.body) opts.body(body, close);
        var btnRow = box.querySelector('.modal-buttons');
        if (btnRow) {
            opts.buttons.forEach(function (b) {
                var btn = U.el('button', 'btn' + (b.primary ? ' btn-primary' : ''), U.esc(b.label));
                btn.setAttribute('data-x', '');
                btn.addEventListener('xfselect', function () { b.onSelect(close, btn); });
                btnRow.appendChild(btn);
            });
        }
        requestAnimationFrame(function () { backdrop.classList.add('show'); });
        XTV.focus.pushRoot(box, { focusEl: opts.focusEl || (btnRow ? btnRow.querySelector('.btn') : null) });
        if (!opts.focusEl && !btnRow) {
            var f = box.querySelector('[data-x]') || box;
            XTV.focus.setFocused(f);
        }
        backdrop._box = box;
        modalStack.push(backdrop);
        return { close: close, box: box, backdrop: backdrop };
    }

    /* ================= TOAST / SPINNER ================= */

    var toastT = null;
    function toast(msg, ms) {
        var t = U.byId('toast');
        if (!t) {
            t = U.el('div', 'toast');
            t.id = 'toast';
            document.body.appendChild(t);
        }
        t.innerHTML = U.esc(msg);
        t.classList.add('show');
        clearTimeout(toastT);
        toastT = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
    }

    var spinCount = 0;
    function spinner(on, label) {
        var s = U.byId('spinner');
        if (!s) {
            s = U.el('div', 'spinner-wrap');
            s.id = 'spinner';
            s.innerHTML = '<div class="spinner"></div><div class="spinner-label"></div>';
            document.body.appendChild(s);
        }
        spinCount += on ? 1 : -1;
        if (spinCount < 0) spinCount = 0;
        s.classList.toggle('show', spinCount > 0);
        s.querySelector('.spinner-label').textContent = label || 'Loading…';
    }

    /* ================= CONFIRM / PROMPT ================= */

    function confirmDlg(title, msg, buttons) {
        return modal({
            title: title,
            body: '<p class="modal-text">' + msg + '</p>',
            buttons: buttons || [
                { label: 'Cancel', onSelect: function (close) { close(); } },
                { label: 'OK', primary: true, onSelect: function (close) { close(); } }
            ]
        });
    }

    /* ================= KEYBOARD ================= */

    /* ================= TEXT PROMPT (native TV IME) ================= */

    function promptText(title, initial, mask, onEnter) {
        // Uses a native <input> so the webOS system keyboard (full symbols,
        // caret editing) or a hardware keyboard handles all typing.
        var value = initial || '';
        var inputRef = null;
        var m = modal({
            title: title,
            cls: 'modal-prompt',
            body: function (body) {
                body.innerHTML = '<input class="prompt-input" type="' + (mask ? 'password' : 'text') + '" autocomplete="off">';
                inputRef = body.querySelector('.prompt-input');
                inputRef.value = value;
                inputRef.addEventListener('input', function () { value = inputRef.value; });
                inputRef.addEventListener('keydown', function (e) {
                    if (e.keyCode === 13) { e.preventDefault(); m.close(); }
                });
                setTimeout(function () { try { inputRef.focus(); } catch (e) {} }, 80);
            },
            buttons: [
                { label: 'Cancel', onSelect: function (close) { close(); } },
                { label: 'Save', primary: true, onSelect: function (close) {
                    if (inputRef) value = inputRef.value;
                    close();
                } }
            ],
            onClose: function () { if (onEnter) onEnter(value); }
        });
        return m;
    }

    /* ================= PIN PAD ================= */

    function pinpad(title, onDone, onCancel) {
        var entered = '';
        var kb = modal({
            title: title,
            cls: 'modal-pin',
            onClose: function () { if (onCancel && entered.length < 4) onCancel(); }
        });
        var dots = U.el('div', 'pin-dots', '<i></i><i></i><i></i><i></i>');
        kb.box.querySelector('.modal-body').appendChild(dots);
        var grid = U.el('div', 'pin-grid');
        var html = '';
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'].forEach(function (k) {
            html += '<div class="kb-key pin-key' + (k === 'OK' ? ' kb-done' : '') + (k === 'C' ? ' pin-clear' : '') + '" data-x data-key="' + k + '">' + k + '</div>';
        });
        grid.innerHTML = html;
        kb.box.querySelector('.modal-body').appendChild(grid);

        function upd() {
            var is = dots.querySelectorAll('i');
            for (var i = 0; i < is.length; i++) is[i].classList.toggle('on', i < entered.length);
            if (entered.length >= 4) {
                setTimeout(function () {
                    var val = entered;
                    entered = '';
                    kb.close(true);
                    onDone(val);
                }, 160);
            }
        }
        grid.addEventListener('xfselect', function (e) {
            var k = e.detail.el.getAttribute('data-key');
            if (k === 'C') entered = '';
            else if (k === 'OK') {
                if (entered.length === 4) {
                    var val = entered; entered = 'done';
                    kb.close(true); onDone(val); return;
                }
                return;
            } else if (entered.length < 4) entered += k;
            upd();
            XTV.focus.setFocused(e.detail.el);
        });
        setTimeout(function () {
            var first = grid.querySelector('[data-x]');
            if (first) XTV.focus.setFocused(first);
        }, 30);
        return kb;
    }

    function checkPin(title, onOk) {
        var s = XTV.store.settings();
        if (!s.pinEnabled || !s.pin) return onOk();
        pinpad(title || 'Enter PIN', function (val) {
            if (val === s.pin) onOk();
            else { toast('Incorrect PIN'); }
        });
    }

    /* ================= MISC ================= */

    function stars(rating) {
        var r = Math.round((rating || 0) / 2); // 0..5
        var out = '';
        for (var i = 1; i <= 5; i++) out += i <= r ? '★' : '☆';
        return out;
    }

    function playBadgeHtml(pct) {
        return '<div class="progress-line"><i style="width:' + U.clamp(pct, 0, 100) + '%"></i></div>';
    }

    function fieldRow(label, value, id) {
        var el = U.el('div', 'field-row');
        el.setAttribute('data-x', '');
        el.innerHTML = '<div class="field-label">' + U.esc(label) + '</div>' +
            '<div class="field-value" id="' + (id || '') + '">' + U.esc(value || '') + '</div>';
        return el;
    }

    XTV.ui = {
        cardEl: cardEl,
        buildRow: buildRow,
        Grid: Grid,
        modal: modal,
        topModal: topModal,
        toast: toast,
        spinner: spinner,
        confirm: confirmDlg,
        promptText: promptText,
        pinpad: pinpad,
        checkPin: checkPin,
        stars: stars,
        playBadgeHtml: playBadgeHtml,
        fieldRow: fieldRow
    };
})();
