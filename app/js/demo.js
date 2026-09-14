/* Solstice TV — Demo mode: mock Xtream provider so the full UI can be explored
   without credentials (and tested in a desktop browser). */
(function () {
    'use strict';
    var U = XTV.util;

    var ADJ = ['Crimson', 'Silent', 'Golden', 'Broken', 'Midnight', 'Electric', 'Forgotten', 'Wild', 'Hidden', 'Final', 'Distant', 'Velvet', 'Iron', 'Neon', 'Sacred', 'Hollow'];
    var NOUN = ['Horizon', 'Ember', 'Harbor', 'Cipher', 'Mirage', 'Legacy', 'Reckoning', 'Eden', 'Signal', 'Journey', 'Whisper', 'Frontier', 'Echo', 'Paradox', 'Crown', 'Ridge'];
    var PLOTS = [
        'A retired detective returns to the case that ruined her career, only to find the trail leads back home.',
        'Two strangers stranded in the desert discover they are running from the same past.',
        'In a city where memories are currency, a courier smuggles the one thing money cannot buy.',
        'A championship underdog story about the team nobody believed in and the coach who never left.',
        'An astrophysicist hears a signal from deep space — and it is answering her specifically.',
        'A family reunion unravels into a comedy of errors when the wrong house is rented for the weekend.'
    ];
    var CAST = ['Mara Ellis', 'Jonah Reid', 'Talia Voss', 'Marcus Chen', 'Elena Petrova', 'Sam Okafor', 'Nina Kowalski', 'Darius Bell'];
    var SHOWS = [['Frontier Valley', 'Drama'], ['Nightwatch', 'Crime'], ['Starlight Academy', 'Sci-Fi'], ['The Harbor House', 'Drama'], ['Quantum Six', 'Action'], ['Paper Kingdoms', 'Fantasy'], ['Cold Case Unit', 'Crime'], ['Sunrise Diner', 'Comedy'], ['Deep Blue Files', 'Documentary'], ['Motor City Rise', 'Drama']];
    var LIVE_CATS = ['News', 'Sports', 'Movies', 'Entertainment', 'Kids', 'Documentary'];
    var CH_NAMES = {
        News: ['Metro News 24', 'World Wire HD', 'The Daily Brief', 'Skyline Tonight', 'Global Report'],
        Sports: ['Arena Sports 1', 'Arena Sports 2', 'Touchdown TV', 'Goal Rush', 'Speed Zone'],
        Movies: ['Cinema One', 'Cinema Classics', 'Action Vault', 'Indie Screen', 'Thriller Zone'],
        Entertainment: ['Prime Life', 'Studio X', 'Laughter Lab', 'Backstage', 'The Weekend Show'],
        Kids: ['Toon Galaxy', 'Playroom TV', 'Dino Friends', 'Storybook Lane'],
        Documentary: ['Blue Planet Now', 'History Unlocked', 'Wild Frontier', 'Science Hour']
    };
    var PROG_WORDS = ['Morning Report', 'Talk of the Town', 'Deep Dive', 'Live Coverage', 'The Big Interview', 'Classic Rewind', 'Prime Special', 'Late Night Line', 'Game of the Week', 'World in Focus', 'Kitchen Chronicles', 'Frontier Days'];
    var VOD_STREAMS = [
        'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        'https://test-streams.mux.dev/pts_shift/master.m3u8',
        'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8',
        'https://test-streams.mux.dev/test_001/stream.m3u8'
    ];
    var LIVE_STREAM = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

    function hash(s) {
        var h = 5381;
        for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return Math.abs(h);
    }

    function buildCatalog() {
        var now = Math.floor(Date.now() / 1000);
        var liveCats = LIVE_CATS.map(function (n, i) { return { id: 'lc' + i, name: n }; });
        var live = [];
        var num = 100;
        liveCats.forEach(function (c) {
            (CH_NAMES[c.name] || []).forEach(function (n) {
                live.push({
                    kind: 'live', id: 'L' + num, num: num, name: n,
                    icon: U.placeholder(n, 'wide', hash(n) % 360),
                    catId: c.id, added: now - hash(n) % 500000
                });
                num++;
            });
        });
        var vodCats = [{ id: 'mc0', name: 'Action' }, { id: 'mc1', name: 'Comedy' }, { id: 'mc2', name: 'Drama' }, { id: 'mc3', name: 'Sci-Fi' }, { id: 'mc4', name: 'Thriller' }];
        var vod = [];
        var i = 0;
        vodCats.forEach(function (c) {
            for (var k = 0; k < 15; k++) {
                var name = ADJ[(i * 7 + k * 3) % ADJ.length] + ' ' + NOUN[(i * 5 + k * 11) % NOUN.length];
                vod.push({
                    kind: 'movie', id: 'M' + (1000 + i * 15 + k), name: name,
                    icon: U.placeholder(name, 'poster', hash(name) % 360),
                    catId: c.id, rating: 5 + (hash(name) % 50) / 10,
                    added: now - hash(name) % 30000000, container: 'mp4'
                });
            }
            i++;
        });
        var serCats = [{ id: 'sc0', name: 'Drama Series' }, { id: 'sc1', name: 'Crime Series' }, { id: 'sc2', name: 'Family Series' }];
        var series = SHOWS.map(function (s, idx) {
            return {
                kind: 'series', id: 'S' + idx, name: s[0],
                icon: U.placeholder(s[0], 'poster', hash(s[0]) % 360),
                catId: serCats[idx % 3].id, rating: 6 + (hash(s[0]) % 40) / 10,
                added: now - hash(s[0]) % 20000000,
                plot: PLOTS[idx % PLOTS.length], genre: s[1], cast: CAST.join(','),
                release: '20' + (15 + idx % 9) + '-01-15', year: '20' + (15 + idx % 9)
            };
        });
        return { liveCats: liveCats, live: live, vodCats: vodCats, vod: vod, serCats: serCats, series: series, loadedAt: Date.now() };
    }

    function demoPlot(name) {
        return PLOTS[hash(name) % PLOTS.length];
    }

    function install() {
        var catalog = buildCatalog();
        var M = XTV.xtream;
        M.auth = function () {
            return Promise.resolve({ user_info: { username: 'demo', status: 'Active', exp_date: String(Math.floor(Date.now() / 1000) + 86400 * 30), active_cons: '1', max_connections: '4' }, server_info: { url: 'demo.local' } });
        };
        M.info = function () { return { user_info: { username: 'demo', active_cons: '1', max_connections: '4', exp_date: String(Math.floor(Date.now() / 1000) + 86400 * 30) }, server_info: { url: 'demo.local' } }; };
        M.catalog = function () { return Promise.resolve(catalog); };
        M.liveUrl = function () { return LIVE_STREAM; };
        M.movieUrl = function (id) { return VOD_STREAMS[hash(id) % VOD_STREAMS.length]; };
        M.episodeUrl = function (ep) { return VOD_STREAMS[hash(ep.id) % VOD_STREAMS.length]; };
        M.catchupUrl = function () { return LIVE_STREAM; };
        M.epgUrl = function () { return ''; };
        M.vodInfo = function (id) {
            var it = catalog.vod.find(function (x) { return x.id === id; }) || { name: 'Unknown' };
            return Promise.resolve({
                id: id, name: it.name, icon: it.icon,
                plot: demoPlot(it.name),
                cast: CAST.slice(0, 5).join(', '),
                director: 'A. Director',
                genre: 'Drama, Thriller',
                duration: '1h 47m',
                release: '202' + (hash(id) % 6) + '-03-21',
                year: '202' + (hash(id) % 6),
                rating: it.rating || 7.2,
                container: 'mp4',
                youtube: ''
            });
        };
        M.seriesInfo = function (id) {
            var it = catalog.series.find(function (x) { return x.id === id; }) || { name: 'Show' };
            var h = hash(id);
            var nSeasons = 1 + h % 3;
            var seasons = [], episodes = {};
            for (var s = 1; s <= nSeasons; s++) {
                var nEps = 4 + (h + s) % 7;
                seasons.push({ season: s, name: 'Season ' + s, episodes: nEps });
                var list = [];
                for (var e = 1; e <= nEps; e++) {
                    var title = 'Episode ' + e + ': ' + NOUN[(h + e * 7) % NOUN.length] + ' ' + ADJ[(h + e * 3) % ADJ.length];
                    list.push({
                        id: id + 'E' + s + e,
                        season: s, episode: e, name: title,
                        icon: U.placeholder(title, 'wide', (h + e) % 360),
                        plot: PLOTS[(h + e) % PLOTS.length],
                        duration: 1800 + ((h + e * 60) % 1800),
                        container: 'mp4', added: 0
                    });
                }
                episodes[s] = list;
            }
            return Promise.resolve({ id: id, seasons: seasons, episodes: episodes, info: { plot: demoPlot(it.name) } });
        };
        M.shortEpg = function (streamId, limit) {
            var h = hash(streamId);
            var now = Date.now();
            var out = [];
            var blockMin = 45 + (h % 5) * 15;                 // program length 45–105 min
            var t = Math.floor(now / 60000);
            var start = t - (t % blockMin);                   // current program start
            var n = limit || 4;
            function mi(x, len) { return ((x % len) + len) % len; }
            for (var i = -1; i < n - 1; i++) {                // include the previous program (catch-up)
                var sMin = start + i * blockMin;
                out.push({
                    title: PROG_WORDS[mi(h + i, PROG_WORDS.length)] + ': ' + ADJ[mi(h + i * 3, ADJ.length)] + ' ' + NOUN[mi(h + i * 7, NOUN.length)],
                    desc: PLOTS[mi(h + i, PLOTS.length)],
                    start: new Date(sMin * 60000),
                    stop: new Date((sMin + blockMin) * 60000)
                });
            }
            return Promise.resolve(out);
        };
    }

    XTV.demo = { install: install };
})();
