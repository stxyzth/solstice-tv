/* Solstice TV — Demo mode with real public streams and recognizable content
   so the app feels like a working IPTV client out of the box. */
(function () {
    'use strict';
    var U = XTV.util;

    var LIVE_CHANNELS = [
        { cat: 'News', name: 'NASA TV', url: 'https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8', icon: '' },
        { cat: 'News', name: 'Al Jazeera English', url: 'https://live-hls-web-aje.getaj.net/AJE/01.m3u8', icon: '' },
        { cat: 'News', name: 'DW News', url: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8', icon: '' },
        { cat: 'News', name: 'France 24 English', url: 'https://stream.france24.com/live/hls/f24_en.m3u8', icon: '' },
        { cat: 'News', name: 'CGTN', url: 'https://news.cgtn.com/resource/live/english/cgtn-news.m3u8', icon: '' },
        { cat: 'Entertainment', name: 'Pluto TV Movies', url: 'https://service-stitcher.clusters.pluto.tv/v1/stitch/embed/hls/channel/5f1abd3e4613de000749a3fc/master.m3u8', icon: '' },
        { cat: 'Music', name: 'Lofi Girl Radio', url: 'https://play.streamafrica.net/lofiradio', icon: '' },
        { cat: 'Science', name: 'NASA ISS Live', url: 'https://ntv2.akamaized.net/hls/live/2014076/NASA-NTV2-HLS/master.m3u8', icon: '' },
        { cat: 'Entertainment', name: 'ABC News Live', url: 'https://content.uplynk.com/channel/3324f2467c414329b3b0cc5cd987b6be.m3u8', icon: '' },
        { cat: 'Sports', name: 'Red Bull TV', url: 'https://rbmn-live.akamaized.net/hls/live/590964/BossLifeLive/master.m3u8', icon: '' }
    ];

    var LIVE_CATS_LIST = ['News', 'Entertainment', 'Sports', 'Music', 'Science'];

    // Real free VOD from various HLS test sources
    var REAL_MOVIES = [
        { name: 'Big Buck Bunny', genre: 'Animation', year: '2008', rating: 7.1, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', plot: 'A giant rabbit seeks revenge on three bullying rodents in this open-source animated short that became a standard for video testing worldwide.' },
        { name: 'Sintel', genre: 'Animation', year: '2010', rating: 7.5, url: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8', plot: 'A lone warrior searches for a baby dragon she befriended, braving dangerous lands and discovering the true cost of her quest.' },
        { name: 'Tears of Steel', genre: 'Sci-Fi', year: '2012', rating: 6.4, url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8', plot: 'In a dystopian future, a group of warriors and scientists must reverse the effects of a devastating robot invasion using untested time-travel technology.' },
        { name: 'Elephant\'s Dream', genre: 'Animation', year: '2006', rating: 6.0, url: 'https://test-streams.mux.dev/pts_shift/master.m3u8', plot: 'Two characters explore a surreal machine-world, finding that their perceptions of reality differ in fundamental and irreconcilable ways.' },
        { name: 'Caminandes: Llama Drama', genre: 'Comedy', year: '2013', rating: 7.3, url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8', plot: 'A determined llama tries everything to cross a road blocked by an uncooperative fence in the Patagonian steppe.' },
        { name: 'Spring', genre: 'Drama', year: '2019', rating: 7.8, url: 'https://test-streams.mux.dev/test_001/stream.m3u8', plot: 'A shepherd dog and his owner live in a peaceful valley until a playful deer changes their quiet existence forever.' },
        { name: 'Agent 327: Operation Barbershop', genre: 'Action', year: '2017', rating: 7.0, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', plot: 'Dutch secret agent 327 investigates a suspicious barbershop in this fast-paced animated action short.' },
        { name: 'Cosmos Laundromat', genre: 'Sci-Fi', year: '2015', rating: 6.8, url: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8', plot: 'A suicidal sheep on an isolated island meets a mysterious being who offers him the chance to live countless alternative lives.' }
    ];

    var REAL_SERIES = [
        { name: 'Blender Open Movies', genre: 'Animation', year: '2006', plot: 'The complete collection of open-source animated films from the Blender Foundation.', seasons: 3 },
        { name: 'NASA Explorers', genre: 'Documentary', year: '2018', plot: 'Scientists and engineers at NASA push the boundaries of space exploration.', seasons: 2 },
        { name: 'Nature Chronicles', genre: 'Documentary', year: '2020', plot: 'A deep dive into the planet\'s most extraordinary ecosystems and the creatures that call them home.', seasons: 2 }
    ];

    var PROG_WORDS = ['Morning Report', 'Talk of the Town', 'Deep Dive', 'Live Coverage', 'The Big Interview', 'Classic Rewind', 'Prime Special', 'Late Night Line', 'Game of the Week', 'World in Focus', 'Kitchen Chronicles', 'Frontier Days'];
    var ADJ = ['Crimson', 'Silent', 'Golden', 'Broken', 'Midnight', 'Electric', 'Forgotten', 'Wild', 'Hidden', 'Final', 'Distant', 'Velvet', 'Iron', 'Neon'];
    var NOUN = ['Horizon', 'Ember', 'Harbor', 'Cipher', 'Mirage', 'Legacy', 'Reckoning', 'Eden', 'Signal', 'Journey', 'Whisper', 'Frontier'];
    var PLOTS = [
        'A retired detective returns to the case that ruined her career, only to find the trail leads back home.',
        'Two strangers stranded in the desert discover they are running from the same past.',
        'In a city where memories are currency, a courier smuggles the one thing money cannot buy.',
        'A championship underdog story about the team nobody believed in and the coach who never left.',
        'An astrophysicist hears a signal from deep space — and it is answering her specifically.',
        'A family reunion unravels into a comedy of errors when the wrong house is rented for the weekend.'
    ];
    var CAST = ['Mara Ellis', 'Jonah Reid', 'Talia Voss', 'Marcus Chen', 'Elena Petrova', 'Sam Okafor'];

    function hash(s) {
        var h = 5381;
        for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return Math.abs(h);
    }

    function buildCatalog() {
        var now = Math.floor(Date.now() / 1000);

        // Live channels from real streams
        var catMap = {};
        var liveCats = [];
        LIVE_CATS_LIST.forEach(function (n, i) {
            var c = { id: 'lc' + i, name: n };
            catMap[n] = c.id;
            liveCats.push(c);
        });

        var live = LIVE_CHANNELS.map(function (ch, i) {
            return {
                kind: 'live', id: 'L' + (100 + i), num: 100 + i, name: ch.name,
                icon: ch.icon || U.placeholder(ch.name, 'wide', hash(ch.name) % 360),
                catId: catMap[ch.cat] || 'lc0',
                added: now - i * 100000,
                _demoUrl: ch.url
            };
        });

        // VOD from real Blender/test streams
        var vodCats = [
            { id: 'mc0', name: 'Animation' },
            { id: 'mc1', name: 'Sci-Fi' },
            { id: 'mc2', name: 'Drama' },
            { id: 'mc3', name: 'Action' },
            { id: 'mc4', name: 'Comedy' }
        ];
        var vod = REAL_MOVIES.map(function (m, i) {
            var catIdx = hash(m.genre) % vodCats.length;
            return {
                kind: 'movie', id: 'M' + (1000 + i), name: m.name,
                icon: U.placeholder(m.name, 'poster', hash(m.name) % 360),
                catId: vodCats[catIdx].id,
                rating: m.rating,
                year: m.year,
                added: now - i * 2000000,
                container: 'mp4',
                plot: m.plot,
                _demoUrl: m.url
            };
        });

        // Series
        var serCats = [{ id: 'sc0', name: 'Animation Series' }, { id: 'sc1', name: 'Documentary Series' }];
        var series = REAL_SERIES.map(function (s, idx) {
            return {
                kind: 'series', id: 'S' + idx, name: s.name,
                icon: U.placeholder(s.name, 'poster', hash(s.name) % 360),
                catId: serCats[idx % serCats.length].id,
                rating: 6 + (hash(s.name) % 30) / 10,
                added: now - idx * 5000000,
                plot: s.plot, genre: s.genre, cast: CAST.join(','),
                year: s.year,
                _seasons: s.seasons
            };
        });

        return { liveCats: liveCats, live: live, vodCats: vodCats, vod: vod, serCats: serCats, series: series, loadedAt: Date.now() };
    }

    function install() {
        var catalog = buildCatalog();
        var M = XTV.xtream;

        var liveById = {};
        catalog.live.forEach(function (c) { liveById[c.id] = c; });
        var vodById = {};
        catalog.vod.forEach(function (v) { vodById[v.id] = v; });

        M.auth = function () {
            return Promise.resolve({
                user_info: { username: 'demo', status: 'Active', exp_date: String(Math.floor(Date.now() / 1000) + 86400 * 30), active_cons: '1', max_connections: '4' },
                server_info: { url: 'demo.solstice.tv' }
            });
        };
        M.info = function () {
            return {
                user_info: { username: 'demo', active_cons: '1', max_connections: '4', exp_date: String(Math.floor(Date.now() / 1000) + 86400 * 30) },
                server_info: { url: 'demo.solstice.tv' }
            };
        };
        M.catalog = function () { return Promise.resolve(catalog); };

        M.liveUrl = function (id) {
            var ch = liveById[id];
            return ch ? ch._demoUrl : LIVE_CHANNELS[0].url;
        };
        M.movieUrl = function (id) {
            var v = vodById[id];
            return v ? v._demoUrl : REAL_MOVIES[0].url;
        };
        M.episodeUrl = function (ep) {
            var h = hash(ep.id || 'x');
            return REAL_MOVIES[h % REAL_MOVIES.length].url;
        };
        M.catchupUrl = function () { return LIVE_CHANNELS[0].url; };
        M.epgUrl = function () { return ''; };

        M.vodInfo = function (id) {
            var it = vodById[id] || { name: 'Unknown', icon: '', rating: 7, plot: '' };
            var m = REAL_MOVIES.find(function (x) { return 'M' + (1000 + REAL_MOVIES.indexOf(x)) === id; }) || REAL_MOVIES[0];
            return Promise.resolve({
                id: id, name: it.name, icon: it.icon,
                plot: m.plot || it.plot || PLOTS[hash(id) % PLOTS.length],
                cast: CAST.join(', '),
                director: 'Blender Foundation',
                genre: m.genre || 'Animation',
                duration: '12m',
                release: m.year + '-01-01',
                year: m.year || '2020',
                rating: it.rating || 7,
                container: 'mp4',
                youtube: ''
            });
        };

        M.seriesInfo = function (id) {
            var it = catalog.series.find(function (x) { return x.id === id; }) || { name: 'Show', _seasons: 2 };
            var h = hash(id);
            var nSeasons = it._seasons || 2;
            var seasons = [], episodes = {};
            for (var s = 1; s <= nSeasons; s++) {
                var nEps = 3 + (h + s) % 5;
                seasons.push({ season: s, name: 'Season ' + s, episodes: nEps });
                var list = [];
                for (var e = 1; e <= nEps; e++) {
                    var title = 'Episode ' + e + ': ' + NOUN[(h + e * 7) % NOUN.length] + ' ' + ADJ[(h + e * 3) % ADJ.length];
                    list.push({
                        id: id + 'E' + s + e,
                        season: s, episode: e, name: title,
                        icon: U.placeholder(title, 'wide', (h + e) % 360),
                        plot: PLOTS[(h + e) % PLOTS.length],
                        duration: 600 + ((h + e * 60) % 600),
                        container: 'mp4', added: 0
                    });
                }
                episodes[s] = list;
            }
            return Promise.resolve({ id: id, seasons: seasons, episodes: episodes, info: { plot: it.plot } });
        };

        M.shortEpg = function (streamId, limit) {
            var h = hash(streamId);
            var now = Date.now();
            var out = [];
            var blockMin = 45 + (h % 5) * 15;
            var t = Math.floor(now / 60000);
            var start = t - (t % blockMin);
            var n = limit || 4;
            function mi(x, len) { return ((x % len) + len) % len; }
            for (var i = -1; i < n - 1; i++) {
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
