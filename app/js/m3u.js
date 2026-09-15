/* Solstice TV — M3U/M3U8 playlist parser. Produces channel objects
   compatible with the Xtream catalog shape so the rest of the app
   works unchanged. */
(function () {
    'use strict';

    function parse(text) {
        var lines = String(text || '').split('\n');
        var channels = [];
        var id = 1;
        var name = '', icon = '', group = '', catId = '';

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line.indexOf('#EXTINF') === 0) {
                var nameMatch = line.match(/,(.+)$/);
                name = nameMatch ? nameMatch[1].trim() : 'Channel ' + id;
                var logoMatch = line.match(/tvg-logo="([^"]*)"/);
                icon = logoMatch ? logoMatch[1] : '';
                var groupMatch = line.match(/group-title="([^"]*)"/);
                group = groupMatch ? groupMatch[1] : 'Uncategorized';
                catId = group.toLowerCase().replace(/[^a-z0-9]/g, '_');
            } else if (line && line.charAt(0) !== '#') {
                channels.push({
                    id: 'm3u_' + id,
                    name: name || 'Channel ' + id,
                    icon: icon,
                    num: id,
                    catId: catId || 'uncategorized',
                    catName: group || 'Uncategorized',
                    url: line,
                    type: 'live'
                });
                id++;
                name = ''; icon = ''; group = ''; catId = '';
            }
        }
        return channels;
    }

    function categories(channels) {
        var seen = {}, cats = [];
        for (var i = 0; i < channels.length; i++) {
            var c = channels[i];
            if (!seen[c.catId]) {
                seen[c.catId] = 1;
                cats.push({ id: c.catId, name: c.catName });
            }
        }
        return cats;
    }

    XTV.m3u = { parse: parse, categories: categories };
})();
