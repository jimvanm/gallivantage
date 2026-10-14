// Where the data lab looks for each source's file.
import { tileAt, tileEdges, quadkey, worldcoverName, worldcoverUrls, canopyUrl, overtureTheme, kindColour, kindOf } from '../src/sources.js';
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok  ' + m); };

// Map tiles.
const t = tileAt(44.3077, -77.7990, 14);
ok(t.x === 4651 && t.y === 5938, `Campbellford is in square 14/${t.x}/${t.y}`);
const e = tileEdges(14, t.x, t.y);
ok(e.west < -77.7990 && e.east > -77.7990 && e.south < 44.3077 && e.north > 44.3077, 'the square holds the spot');
ok(Math.abs((e.east - e.west) - 360 / 2 ** 14) < 1e-9, 'a zoom-14 square is 1/16384 of the world across');

// Quadkeys, checked against Bing's own example (3/3/5 is "213").
ok(quadkey(3, 3, 5) === '213', 'quadkey 3/3/5 is 213');
ok(quadkey(0, 0, 0) === '', 'the whole world has an empty quadkey');
ok(quadkey(9, 140, 186).length === 9, 'a zoom-9 quadkey has nine digits');

// WorldCover files are 3-degree squares named by the south-west corner.
ok(worldcoverName(44.3, -77.8) === 'N42W078', 'Campbellford is in N42W078');
ok(worldcoverName(-22.68, 14.53) === 'S24E012', 'Swakopmund is in S24E012');
ok(worldcoverName(15.88, 108.33) === 'N15E108', 'Hội An is in N15E108');
ok(worldcoverName(0.5, -0.5) === 'N00W003', 'just west of the meridian is W003');
ok(worldcoverUrls(44.3, -77.8)[0].endsWith('/v200/2021/map/ESA_WorldCover_10m_2021_v200_N42W078_Map.tif'), '2021 file first');
ok(worldcoverUrls(44.3, -77.8)[1].includes('/v100/2020/'), '2020 file as the fallback');

// Tree heights: one file per zoom-9 tile.
const c9 = tileAt(44.3077, -77.7990, 9);
ok(canopyUrl(44.3077, -77.7990).endsWith('/chm/' + quadkey(9, c9.x, c9.y) + '.tif'), 'tree height file named by its zoom-9 quadkey');

ok(overtureTheme('2026-09-23.1', 'base').endsWith('/tiles/2026-09-23.1/base.pmtiles'), 'Overture base file address');

// One colour per kind, whichever source names it.
ok(kindColour('forest') === kindColour('wood'), 'forest and wood look alike');
ok(kindColour('parking') !== kindColour('park'), 'a car park is not a park');
ok(kindColour('something_new') === kindColour('something_new'), 'unknown kinds get a steady colour');
ok(kindOf({ subtype: 'tree' }) === 'tree' && kindOf({ class: 'a', subtype: 'b' }) === 'a' && kindOf(null) === '(no class)', 'kind from class, else subtype');
