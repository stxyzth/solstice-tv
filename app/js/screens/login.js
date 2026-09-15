/* Solstice TV — first-run / profile login screen. */
(function () {
    'use strict';
    var U = XTV.util;

    function build(params) {
        var p = params || {};
        var editing = p.profile || null;
        var root = U.el('div', 'screen login-screen');

        root.innerHTML =
            '<div class="login-hero"><div class="login-logo">▶</div><h1>Solstice TV</h1>' +
            '<p class="login-tag">Live TV • Movies • Series — for LG webOS</p></div>' +
            '<div class="login-form" id="login-form"></div>';

        var form = root.querySelector('#login-form');
        var fields = [
            { key: 'name', label: 'Profile name', val: editing ? editing.name : 'My Provider' },
            { key: 'url', label: 'Server URL (http://host:port)', val: editing ? editing.url : '' },
            { key: 'username', label: 'Username', val: editing ? editing.username : '' },
            { key: 'password', label: 'Password', val: editing ? editing.password : '', mask: true }
        ];
        var vals = {};
        fields.forEach(function (f) { vals[f.key] = f.val; });

        function fieldEl(f) {
            var el = U.el('div', 'field-row');
            el.setAttribute('data-x', '');
            var label = U.el('div', 'field-label', U.esc(f.label));
            var input = document.createElement('input');
            input.className = 'field-input';
            input.type = f.mask ? 'password' : (f.key === 'url' ? 'url' : 'text');
            input.value = vals[f.key] || '';
            input.setAttribute('autocomplete', 'off');
            input.addEventListener('input', function () { vals[f.key] = input.value; });
            input.addEventListener('focus', function () { var L = this.value.length; try { this.setSelectionRange(L, L); } catch (e) {} });
            input.addEventListener('keydown', function (e) {
                if (e.keyCode === 13) { e.preventDefault(); try { input.blur(); } catch (er) {} }
            });
            el.appendChild(label);
            el.appendChild(input);
            // OK on the row opens the TV system keyboard
            el.addEventListener('xfselect', function () {
                setTimeout(function () { try { input.focus(); } catch (er) {} }, 0);
            });
            return el;
        }

        fields.forEach(function (f) { form.appendChild(fieldEl(f)); });

        var btns = U.el('div', 'login-buttons');
        var connect = U.el('div', 'btn btn-primary', 'Save & Connect');
        connect.setAttribute('data-x', '');
        var m3uBtn = U.el('div', 'btn', 'Import M3U Playlist');
        m3uBtn.setAttribute('data-x', '');
        var demo = U.el('div', 'btn', 'Explore Demo Mode');
        demo.setAttribute('data-x', '');
        btns.appendChild(connect);
        btns.appendChild(m3uBtn);
        btns.appendChild(demo);
        form.appendChild(btns);

        if (XTV.store.profiles().length) {
            var back = U.el('div', 'btn', 'Cancel');
            back.setAttribute('data-x', '');
            btns.appendChild(back);
            back.addEventListener('xfselect', function () { XTV.app.back(); });
        }

        if (editing) {
            var del = U.el('div', 'btn btn-danger', 'Delete Profile');
            del.setAttribute('data-x', '');
            btns.appendChild(del);
            del.addEventListener('xfselect', function () {
                XTV.ui.modal({
                    title: 'Delete profile?',
                    cls: 'modal-narrow',
                    body: '<p class="modal-text">"' + U.esc(editing.name) + '" will be removed. Favorites and history are kept.</p>',
                    buttons: [
                        { label: 'Cancel', onSelect: function (c) { c(); } },
                        { label: 'Delete', primary: true, onSelect: function (c) { c(); XTV.store.removeProfile(editing.id); XTV.app.back(); XTV.app.reloadProfiles(); } }
                    ]
                });
            });
        }

        connect.addEventListener('xfselect', function () {
            if (!vals.url || !vals.username || !vals.password) {
                XTV.ui.toast('Server URL, username and password are required');
                return;
            }
            var profile = editing || {};
            profile.name = vals.name || 'My Provider';
            profile.url = U.parseUrl(vals.url);
            profile.username = vals.username;
            profile.password = vals.password;
            XTV.ui.spinner(true, 'Connecting to ' + profile.url + ' …');
            XTV.xtream.init(profile);
            XTV.xtream.auth().then(function (info) {
                XTV.store.upsertProfile(profile);
                XTV.store.setActiveProfile(profile.id);
                XTV.ui.spinner(false);
                XTV.ui.toast('Connected — welcome, ' + (info.user_info.username || ''));
                if (!XTV.app.demo) XTV.app.startCatalog();
            }).catch(function (err) {
                XTV.ui.spinner(false);
                XTV.ui.modal({
                    title: 'Connection failed',
                    cls: 'modal-narrow',
                    body: '<p class="modal-text">' + U.esc(err.message || String(err)) + '</p><p class="modal-dim">Tips: include the port (e.g. http://host:8080). The server must be an Xtream Codes panel. When run via npm run serve, requests are relayed through this machine automatically.</p>',
                    buttons: [{ label: 'OK', primary: true, onSelect: function (c) { c(); } }]
                });
            });
        });

        m3uBtn.addEventListener('xfselect', function () {
            XTV.ui.promptText('M3U/M3U8 playlist URL', '', false, function (url) {
                if (!url || !url.trim()) return;
                XTV.ui.spinner(true, 'Loading M3U playlist…');
                XTV.net.request({ url: url.trim(), responseType: 'text', timeout: 30000 }, function (err, text) {
                    XTV.ui.spinner(false);
                    if (err || !text) { XTV.ui.toast('Could not load playlist'); return; }
                    var parsed = XTV.m3u.parse(text);
                    if (!parsed.length) { XTV.ui.toast('No channels found in playlist'); return; }
                    var profile = { name: 'M3U Playlist', type: 'm3u', m3uUrl: url.trim(), m3uChannels: parsed };
                    XTV.store.upsertProfile(profile);
                    XTV.store.setActiveProfile(profile.id);
                    XTV.app.catalog = {
                        liveCats: XTV.m3u.categories(parsed),
                        live: parsed,
                        vodCats: [], vod: [],
                        serCats: [], series: []
                    };
                    XTV.app.rawCatalog = XTV.app.catalog;
                    XTV.app.booted = true;
                    XTV.app.setTab('home');
                    XTV.ui.toast('Loaded ' + parsed.length + ' channels from M3U');
                });
            });
        });

        demo.addEventListener('xfselect', function () {
            XTV.app.startDemo();
        });

        setTimeout(function () { XTV.focus.setFocused(fields[1] ? root.querySelectorAll('.field-row')[1] : connect); }, 0);
        return root;
    }

    XTV.screens = XTV.screens || {};
    XTV.screens.login = { build: build };
})();
