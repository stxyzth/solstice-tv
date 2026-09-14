/* Solstice TV — spatial focus engine for D-pad navigation (webOS remote).
   Focusables are elements with a [data-x] attribute. Focused element gets .xf.
   Screens listen for bubbled events: 'xfselect' (OK), 'xfocus' (focus moved),
   'xfedge' (move found nothing), 'xfback' handled by app router. */
(function () {
    'use strict';
    var U = XTV.util;

    var screenRoot = null;     // base root (current screen)
    var stack = [];            // modal roots
    var current = null;        // focused element
    var enabled = true;

    function topRoot() {
        return stack.length ? stack[stack.length - 1] : screenRoot;
    }

    function visible(el) {
        if (!el || !el.ownerDocument || !document.documentElement.contains(el)) return false;
        if (el.offsetParent === null) {
            var cs = getComputedStyle(el);
            if (cs.position !== 'fixed') return false;
        }
        var r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
    }

    function focusables(root) {
        if (!root || !root.isConnected) return [];
        return U.$$('[data-x]', root).filter(visible);
    }

    function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

    var DIRS = {
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 }
    };

    function pick(cands, from, dirName) {
        var d = DIRS[dirName];
        var fr = from.getBoundingClientRect();
        var fc = center(fr);
        var best = null, bestScore = Infinity;
        for (var i = 0; i < cands.length; i++) {
            var c = cands[i];
            if (c === from) continue;
            var r = c.getBoundingClientRect();
            var cc = center(r);
            var vx = cc.x - fc.x, vy = cc.y - fc.y;
            var primary = vx * d.x + vy * d.y;
            var cross = Math.abs(vx * d.y) + Math.abs(vy * d.x);
            // small negative primary allowed when overlapping on cross axis (row offsets)
            if (primary < -Math.max(r.width, r.height) * 0.4) continue;
            var score = Math.max(primary, 0) + cross * 2.2 + Math.abs((d.x ? r.height : r.width) - (d.x ? fr.height : fr.width)) * 0.08;
            if (score < bestScore) { bestScore = score; best = c; }
        }
        return best;
    }

    /* ---------- smooth scrolling ---------- */
    var anims = [];
    function tween(el, prop, to, ms) {
        for (var i = anims.length - 1; i >= 0; i--) {
            if (anims[i].el === el && anims[i].prop === prop) anims.splice(i, 1);
        }
        var from = el[prop];
        var start = performance.now ? performance.now() : Date.now();
        var a = { el: el, prop: prop, raf: 0 };
        anims.push(a);
        function step(t) {
            if (anims.indexOf(a) === -1) return;
            var k = U.clamp((t - start) / ms, 0, 1);
            k = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            el[prop] = from + (to - from) * k;
            if (k < 1) a.raf = requestAnimationFrame(step);
            else anims.splice(anims.indexOf(a), 1);
        }
        a.raf = requestAnimationFrame(step);
    }

    function ensureVisible(el) {
        var node = el.parentElement;
        while (node && node !== document.body) {
            if (node.classList && node.classList.contains('x-scroll')) {
                var r = el.getBoundingClientRect(), b = node.getBoundingClientRect();
                var pad = 24;
                if (node.classList.contains('x-center-x')) {
                    var target = node.scrollLeft + (r.left + r.width / 2) - (b.left + b.width / 2);
                    if (Math.abs(target - node.scrollLeft) > 4) tween(node, 'scrollLeft', Math.max(0, target), 260);
                } else {
                    if (r.left < b.left + pad) tween(node, 'scrollLeft', Math.max(0, node.scrollLeft + r.left - b.left - pad), 220);
                    else if (r.right > b.right - pad) tween(node, 'scrollLeft', node.scrollLeft + r.right - b.right + pad, 220);
                }
                if (r.top < b.top + pad) tween(node, 'scrollTop', Math.max(0, node.scrollTop + r.top - b.top - pad), 220);
                else if (r.bottom > b.bottom - pad) tween(node, 'scrollTop', node.scrollTop + r.bottom - b.bottom + pad, 220);
            }
            node = node.parentElement;
        }
    }

    /* ---------- focus set/move/select ---------- */
    function setFocused(el, opts) {
        opts = opts || {};
        if (current && current !== el) current.classList.remove('xf');
        current = el;
        if (!el) return;
        el.classList.add('xf');
        if (!opts.noScroll) ensureVisible(el);
        if (!opts.silent) {
            try {
                el.dispatchEvent(new CustomEvent('xfocus', { bubbles: true, detail: { el: el } }));
            } catch (e) {
                var ev = document.createEvent('CustomEvent');
                ev.initCustomEvent('xfocus', true, false, { el: el });
                el.dispatchEvent(ev);
            }
        }
    }

    function focusFirst(root, skipTabs) {
        var c = focusables(root || topRoot());
        if (skipTabs) c = c.filter(function (el) { return !el.classList.contains('tab'); });
        if (c.length) setFocused(c[0]);
        return c.length ? c[0] : null;
    }

    function move(dirName) {
        if (!enabled || !current) { if (!current) focusFirst(); return !!current; }
        var cands = focusables(topRoot());
        var next = pick(cands, current, dirName);
        if (next) { setFocused(next); return true; }
        edge(dirName);
        return false;
    }

    function edge(dirName) {
        var t = current || topRoot();
        if (!t) return;
        try {
            // bubbles from the focused element so grid/screen listeners (ancestors) receive it
            t.dispatchEvent(new CustomEvent('xfedge', { bubbles: true, detail: { dir: dirName } }));
        } catch (e) {}
    }

    function select() {
        if (!current) return false;
        try {
            current.dispatchEvent(new CustomEvent('xfselect', { bubbles: true, detail: { el: current } }));
        } catch (e) {
            var ev = document.createEvent('CustomEvent');
            ev.initCustomEvent('xfselect', true, false, { el: current });
            current.dispatchEvent(ev);
        }
        return true;
    }

    /* ---------- roots (screens + modal stack) ---------- */
    function setRoot(el, autoFocus) {
        stack = [];
        current = null;
        screenRoot = el;
        if (autoFocus !== false) focusFirst(el);
    }

    function pushRoot(el, opts) {
        opts = opts || {};
        if (current) current.classList.remove('xf');
        stack.push(el);
        if (opts.focusEl) setFocused(opts.focusEl);
        else focusFirst(el);
    }

    function popRoot() {
        var top = stack.pop();
        if (top && top._onpop) top._onpop();
        current = null;
        // return focus into screen content — never onto the tab bar,
        // which would schedule a tab switch back to Home
        focusFirst(topRoot(), true);
    }

    function modalDepth() { return stack.length; }
    function inModal(el) {
        return stack.length && stack[stack.length - 1].contains(el);
    }

    /* ---------- mouse support for desktop dev/testing ---------- */
    document.addEventListener('mousemove', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('[data-x]') : null;
        if (t && t !== current && visible(t)) setFocused(t, { noScroll: false, silent: true });
    });
    document.addEventListener('click', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('[data-x]') : null;
        if (t && t === current) select();
    });

    XTV.focus = {
        setRoot: setRoot, pushRoot: pushRoot, popRoot: popRoot,
        focusFirst: focusFirst, setFocused: setFocused, current: function () { return current; },
        move: move, select: select, ensureVisible: ensureVisible,
        enabled: function (v) { if (v === undefined) return enabled; enabled = v; },
        modalDepth: modalDepth,
        refresh: function () { if (!current || !visible(current)) focusFirst(topRoot()); }
    };
})();
