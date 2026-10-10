"""Cut the world climate zone map into 30-degree squares for the browser.

The map: Koppen-Geiger climate zones, 1986-2010, at 100 seconds of arc
(about 3 km), by Rubel et al. (2017), as shipped in the Python package
kgcpy (BSD licence). Get it with:  pip download kgcpy --no-deps
then unzip the .whl and point this script at kgcpy/kmz_int_reshape.png.

Each square is 1080 x 1080 bytes, one byte per pixel, row 0 at the north
edge, gzipped: data/zones/<row>-<col>.bin.gz (row 0 starts at 90 N, col 0
at 180 W). Squares that are all sea are not written. Byte values follow
ZONES in src/zones.js (1 Af ... 31 ET, 32 sea).

Usage: python make_zones.py path/to/kmz_int_reshape.png path/to/data/zones
"""
import gzip, os, sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src)
W, H = im.size
assert (W, H) == (12960, 6480), (W, H)
S = 1080
os.makedirs(out, exist_ok=True)
data = im.tobytes()
total = 0
for r in range(H // S):
    for c in range(W // S):
        rows = [data[(r * S + j) * W + c * S:(r * S + j) * W + c * S + S] for j in range(S)]
        b = b''.join(rows)
        if b.count(32) == len(b):
            continue
        z = gzip.compress(b, 9, mtime=0)
        with open(os.path.join(out, f'{r}-{c}.bin.gz'), 'wb') as f:
            f.write(z)
        total += len(z)
print('bytes', total)
