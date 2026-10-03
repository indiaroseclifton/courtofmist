"""Generate tileable, high-resolution PBR texture sets for Court of Mist.

Every pattern is built from periodic noise and periodic Voronoi cells, so each map
repeats seamlessly. For each material this writes
    public/textures/<name>_albedo.jpg   (sRGB)
    public/textures/<name>_rough.jpg    (linear)
    public/textures/<name>_normal.jpg   (tangent space, OpenGL / +Y)

usage: python tools/gen_textures.py [names...] [--size 2048]
Needs numpy and Pillow.
"""
import sys
import os
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'textures')
args = [a for a in sys.argv[1:]]
SIZE = 2048
if '--size' in args:
    i = args.index('--size'); SIZE = int(args[i + 1]); del args[i:i + 2]


# ------------------------------------------------------------------ periodic primitives
def _hash(ix, iy, seed):
    h = (ix * 374761393 + iy * 668265263 + seed * 2246822519) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFF) / float(0xFFFFFF)


def grid(n=None):
    n = n or SIZE
    v = (np.arange(n) + 0.5) / n
    return np.meshgrid(v, v)  # u, v in [0,1)


def vnoise(u, v, period, seed=0):
    """Value noise that tiles over [0,1) with an integer number of cells."""
    x, y = u * period, v * period
    xi, yi = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
    xf, yf = x - xi, y - yi
    sx, sy = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf)
    def h(a, b):
        return _hash(np.mod(a, period), np.mod(b, period), seed)
    a, b, c, d = h(xi, yi), h(xi + 1, yi), h(xi, yi + 1), h(xi + 1, yi + 1)
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy


def fbm(u, v, base=4, octaves=6, seed=0, gain=0.5):
    f, amp, p, tot = 0.0, 1.0, base, 0.0
    for o in range(octaves):
        f = f + amp * vnoise(u, v, p, seed + o * 31)
        tot += amp
        amp *= gain
        p *= 2
    return f / tot


def ridged(u, v, base=4, octaves=6, seed=0):
    return 1 - np.abs(fbm(u, v, base, octaves, seed) * 2 - 1)


def voronoi(u, v, cells, seed=0, jitter=0.9, stretch=(1.0, 1.0)):
    """Periodic Voronoi on a jittered cells x cells lattice. Returns F1, F2, cell id."""
    sxs, sys_ = stretch
    x, y = u * cells, v * cells
    xi, yi = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
    f1 = np.full(x.shape, 9.0); f2 = np.full(x.shape, 9.0); cid = np.zeros(x.shape)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            cx, cy = xi + ox, yi + oy
            wx, wy = np.mod(cx, cells), np.mod(cy, cells)
            px = cx + 0.5 + (_hash(wx, wy, seed) - 0.5) * jitter
            py = cy + 0.5 + (_hash(wx, wy, seed + 7) - 0.5) * jitter
            d = np.hypot((x - px) * sxs, (y - py) * sys_)
            closer = d < f1
            f2 = np.where(closer, f1, np.minimum(f2, d))
            cid = np.where(closer, _hash(wx, wy, seed + 13), cid)
            f1 = np.where(closer, d, f1)
    return f1, f2, cid


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.stack([-dx, dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def save(name, albedo, rough, height, strength=6.0):
    os.makedirs(OUT, exist_ok=True)
    a = np.clip(albedo, 0, 1)
    Image.fromarray((a ** (1 / 2.2) * 255 + 0.5).astype(np.uint8)).save(f'{OUT}/{name}_albedo.jpg', quality=88)
    r = np.clip(rough, 0, 1)
    rs = r.shape[0] // 2
    Image.fromarray((r * 255 + 0.5).astype(np.uint8)).resize((rs, rs), Image.LANCZOS).save(f'{OUT}/{name}_rough.jpg', quality=88)
    n = normal_from_height(height, strength * h_scale(height))
    Image.fromarray((n * 255 + 0.5).astype(np.uint8)).save(f'{OUT}/{name}_normal.jpg', quality=92)
    print('wrote', name)


def h_scale(h):
    return h.shape[0] / 512.0


def tint(base, *mods):
    out = np.ones(mods[0].shape + (3,)) * np.array(base)
    for m in mods:
        out = out * m[..., None]
    return out


def mix(a, b, t):
    t = t[..., None] if t.ndim == 2 else t
    return a * (1 - t) + b * t


def col(c, shape):
    return np.ones(shape + (3,)) * np.array(c, dtype=float)


# ------------------------------------------------------------------ materials
# Linear-space albedo values throughout.

def setts():
    """Hand-laid basalt setts, rain in the joints and in shallow puddles."""
    u, v = grid()
    wu = u + (fbm(u, v, 8, 3, 1) - 0.5) * 0.012
    wv = v + (fbm(u, v, 8, 3, 2) - 0.5) * 0.012
    f1, f2, cid = voronoi(wu, wv, 14, 3, 0.75, stretch=(0.72, 1.0))
    edge = f2 - f1
    stone = smooth(0.02, 0.16, edge)
    dome = np.sqrt(np.clip(stone, 0, 1))
    grain = fbm(u, v, 64, 4, 5)
    pud = smooth(0.52, 0.6, fbm(u, v, 3, 4, 9))
    joint = 1 - stone
    wet = np.clip(np.maximum(joint * 1.2, pud), 0, 1)
    tone = 0.035 + cid * 0.07 + (grain - 0.5) * 0.03
    alb = col((1, 0.97, 0.93), u.shape) * tone[..., None]
    alb = mix(alb, alb * 0.45, wet * 0.8)
    alb = mix(alb, col((0.012, 0.011, 0.01), u.shape), joint * 0.6)
    rough = np.clip(0.62 + (grain - 0.5) * 0.2 - wet * 0.58, 0.04, 1)
    height = dome * (1 - pud * 0.85) * 0.9 + grain * 0.06
    save('setts', alb, rough, height, 5.0)


def ashlar(name='ashlar', base=(0.48, 0.44, 0.38), rows=8, seed=0):
    u, v = grid()
    row = np.floor(v * rows)
    off = _hash(row.astype(np.int64), 0, seed) * 0.8
    cols_per = 3
    x = u * cols_per + off
    block = np.floor(x)
    fx, fy = x - block, v * rows - row
    bid = _hash(np.mod(block.astype(np.int64), cols_per), row.astype(np.int64), seed + 1)
    e = np.minimum(np.minimum(fx, 1 - fx) * (rows / cols_per), np.minimum(fy, 1 - fy))
    chip = fbm(u, v, 32, 4, seed + 4)
    mortar = 1 - smooth(0.015, 0.035 + chip * 0.02, e)
    n = fbm(u, v, 16, 6, seed + 2)
    streak = fbm(u * 1, v, 4, 5, seed + 3)  # broad stains
    soot = smooth(0.55, 0.8, fbm(u, v, 2, 5, seed + 8))
    tone = 0.85 + bid * 0.25 + (n - 0.5) * 0.25
    alb = col(base, u.shape) * tone[..., None]
    alb = alb * (1 - soot * 0.45)[..., None] * (0.9 + streak * 0.2)[..., None]
    alb = mix(alb, alb * 0.35, mortar)
    rough = 0.82 + (n - 0.5) * 0.1 - soot * 0.12
    height = (1 - mortar) * (0.8 + chip * 0.2) + n * 0.15
    save(name, alb, rough, height, 3.0)


def plaster():
    """White lime plaster, tinted per building in the game; flakes reveal stone."""
    u, v = grid()
    n = fbm(u, v, 6, 7, 21)
    flake = smooth(0.66, 0.68, fbm(u, v, 12, 5, 22))
    trowel = fbm(u * 1.0, v, 3, 4, 23)
    alb = col((0.82, 0.8, 0.76), u.shape) * (0.88 + n * 0.2)[..., None] * (0.95 + trowel * 0.1)[..., None]
    alb = mix(alb, col((0.32, 0.29, 0.26), u.shape), flake)
    rough = 0.9 - flake * 0.05
    height = n * 0.3 + trowel * 0.2 - flake * 0.6
    save('plaster', alb, rough, height, 2.0)


def basalt():
    """Hewn City: black basalt, chisel-faceted, wet streaks that catch the torches."""
    u, v = grid()
    f1, f2, cid = voronoi(u, v, 9, 41, 1.0)
    facets = (f2 - f1)
    r = ridged(u, v, 8, 6, 42)
    seep = smooth(0.55, 0.75, fbm(u, v, 6, 5, 43) * 0.6 + fbm(u, v, 3, 3, 45) * 0.4)
    alb = col((0.03, 0.03, 0.034), u.shape) * (0.7 + cid * 0.5 + r * 0.3)[..., None]
    alb = mix(alb, alb * 0.5, seep)
    rough = np.clip(0.55 + r * 0.2 - seep * 0.5, 0.05, 1)
    height = facets * 0.6 + r * 0.4
    save('basalt', alb, rough, height, 4.0)


def marble():
    u, v = grid()
    turb = fbm(u, v, 3, 7, 51)
    vein = np.abs(np.sin((u * 2 + v * 3 + turb * 3.0) * np.pi * 2))
    vein = 1 - smooth(0.0, 0.08, vein)
    fine = 1 - smooth(0.0, 0.03, np.abs(np.sin((u * 5 - v * 2 + fbm(u, v, 6, 6, 52) * 4) * np.pi * 2)))
    alb = col((0.86, 0.84, 0.8), u.shape) * (0.95 + fbm(u, v, 8, 5, 53) * 0.08)[..., None]
    alb = mix(alb, col((0.42, 0.4, 0.38), u.shape), vein * 0.7)
    alb = mix(alb, col((0.6, 0.55, 0.5), u.shape), fine * 0.4)
    rough = 0.12 + vein * 0.1
    height = fbm(u, v, 16, 4, 54) * 0.05
    save('marble', alb, rough, height, 1.0)


def timber():
    u, v = grid()
    planks = 6
    p = np.floor(u * planks)
    pf = u * planks - p
    pid = _hash(p.astype(np.int64), 0, 61)
    vv = v + pid * 3
    grain = np.sin((vv * 40 + fbm(u * 0.5 + pid, vv * 0.2, 4, 5, 62) * 10 + pf * 2) * np.pi) * 0.5 + 0.5
    knots = smooth(0.78, 0.82, fbm(u, v, 8, 4, 63))
    gap = 1 - smooth(0.0, 0.03, np.minimum(pf, 1 - pf))
    alb = col((0.3, 0.2, 0.12), u.shape) * (0.6 + grain * 0.3 + pid * 0.3)[..., None]
    alb = mix(alb, alb * 0.4, knots)
    alb = mix(alb, alb * 0.15, gap)
    rough = 0.6 + grain * 0.15
    height = grain * 0.15 - gap * 0.8 + knots * 0.1
    save('timber', alb, rough, height, 2.5)


def slate():
    u, v = grid()
    rows = 16
    r = np.floor(v * rows)
    off = (r % 2) * 0.5
    x = u * 8 + off
    t = np.floor(x)
    fx, fy = x - t, v * rows - r
    tid = _hash(np.mod(t.astype(np.int64), 8), r.astype(np.int64), 71)
    lap = fy  # each tile thickens toward its lower edge
    edge = 1 - smooth(0.0, 0.04, np.minimum(fx, 1 - fx))
    n = fbm(u, v, 32, 4, 72)
    alb = col((0.05, 0.055, 0.065), u.shape) * (0.7 + tid * 0.6 + n * 0.3)[..., None]
    moss = smooth(0.6, 0.75, fbm(u, v, 6, 5, 73)) * (1 - fy)
    alb = mix(alb, col((0.08, 0.1, 0.04), u.shape), moss * 0.6)
    rough = 0.5 + n * 0.2 + moss * 0.3
    height = lap * 0.6 - edge * 0.5 + n * 0.1
    save('slate', alb, rough, height, 3.0)


def thatch():
    u, v = grid()
    straw = fbm(u, v, 64, 3, 81)
    s2 = fbm(u * 1, v, 128, 2, 82)
    bands = np.sin(v * 24 * np.pi * 2 + fbm(u, v, 8, 3, 83) * 4) * 0.5 + 0.5
    alb = col((0.36, 0.28, 0.15), u.shape) * (0.55 + straw * 0.4 + s2 * 0.2)[..., None] * (0.8 + bands * 0.2)[..., None]
    rot = smooth(0.6, 0.8, fbm(u, v, 4, 5, 84))
    alb = mix(alb, col((0.12, 0.1, 0.07), u.shape), rot * 0.6)
    rough = 0.9 * np.ones_like(u)
    height = straw * 0.5 + bands * 0.3
    save('thatch', alb, rough, height, 3.0)


def grass():
    """Meadow turf seen from walking height: blades, clover, bare patches."""
    u, v = grid()
    blades = fbm(u, v, 256, 2, 91)
    clumps = fbm(u, v, 16, 5, 92)
    bare = smooth(0.62, 0.7, fbm(u, v, 4, 5, 93))
    g = col((0.07, 0.11, 0.03), u.shape) * (0.6 + blades * 0.6)[..., None] * (0.7 + clumps * 0.5)[..., None]
    dry = col((0.16, 0.13, 0.05), u.shape) * (0.6 + blades * 0.5)[..., None]
    g = mix(g, dry, smooth(0.5, 0.8, fbm(u, v, 8, 4, 94)) * 0.5)
    soil = col((0.07, 0.05, 0.035), u.shape) * (0.7 + fbm(u, v, 64, 3, 95) * 0.5)[..., None]
    alb = mix(g, soil, bare)
    rough = 0.85 + bare * 0.1
    height = blades * (1 - bare) * 0.6 + clumps * 0.3
    save('grass', alb, rough, height, 3.5)


def mud():
    u, v = grid()
    n = fbm(u, v, 8, 7, 101)
    ruts = smooth(0.4, 0.6, fbm(u * 1, v, 3, 4, 102))
    pud = smooth(0.58, 0.62, fbm(u, v, 4, 5, 103))
    stones = smooth(0.08, 0.02, voronoi(u, v, 40, 104, 1.0)[0]) * smooth(0.6, 0.7, fbm(u, v, 16, 3, 105))
    alb = col((0.09, 0.065, 0.045), u.shape) * (0.7 + n * 0.5)[..., None]
    alb = mix(alb, col((0.22, 0.2, 0.18), u.shape), stones)
    alb = mix(alb, alb * 0.5, pud)
    rough = np.clip(0.8 - pud * 0.75 - ruts * 0.1, 0.03, 1)
    height = n * 0.4 + stones * 0.5 - pud * 0.5 - ruts * 0.2
    save('mud', alb, rough, height, 4.0)


def snow():
    u, v = grid()
    drift = fbm(u, v, 3, 6, 111)
    crust = fbm(u, v, 32, 4, 112)
    sparkle = (vnoise(u, v, 512, 113) > 0.985).astype(float)
    alb = col((0.82, 0.86, 0.92), u.shape) * (0.9 + drift * 0.1)[..., None]
    rough = np.clip(0.55 + crust * 0.2 - sparkle * 0.5, 0.05, 1)
    height = drift * 0.8 + crust * 0.15
    save('snow', alb, rough, height, 2.0)


def sand():
    u, v = grid()
    w = fbm(u, v, 4, 4, 121)
    ripple = np.sin((v * 30 + w * 6 + u * 2) * np.pi * 2) * 0.5 + 0.5
    grains = vnoise(u, v, 512, 122)
    wet = smooth(0.55, 0.7, fbm(u, v, 3, 4, 123))
    alb = col((0.52, 0.44, 0.31), u.shape) * (0.85 + grains * 0.2 + ripple * 0.05)[..., None]
    alb = mix(alb, alb * 0.6, wet)
    rough = np.clip(0.85 - wet * 0.55, 0.1, 1)
    height = ripple * 0.4 * (1 - wet) + grains * 0.08
    save('sand', alb, rough, height, 3.0)


def leaves():
    """Autumn forest floor: overlapping fallen leaves in rust, gold and oxblood."""
    u, v = grid()
    alb = col((0.045, 0.032, 0.02), u.shape) * (0.6 + fbm(u, v, 32, 3, 131) * 0.6)[..., None]
    height = fbm(u, v, 16, 3, 132) * 0.2
    palette = np.array([(0.35, 0.09, 0.02), (0.55, 0.28, 0.04), (0.25, 0.04, 0.03), (0.42, 0.18, 0.05), (0.2, 0.14, 0.05), (0.5, 0.2, 0.03)])
    for layer, cells in enumerate((18, 26, 34, 44)):
        x, y = u * cells, v * cells
        xi, yi = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
        for oy in (-1, 0, 1):
            for ox in (-1, 0, 1):
                cx, cy = xi + ox, yi + oy
                wx, wy = np.mod(cx, cells), np.mod(cy, cells)
                seed = 200 + layer * 17
                px = cx + 0.5 + (_hash(wx, wy, seed) - 0.5) * 0.9
                py = cy + 0.5 + (_hash(wx, wy, seed + 1) - 0.5) * 0.9
                ang = _hash(wx, wy, seed + 2) * np.pi * 2
                dx, dy = x - px, y - py
                lx = dx * np.cos(ang) + dy * np.sin(ang)
                ly = -dx * np.sin(ang) + dy * np.cos(ang)
                # a pointed leaf: an ellipse pinched at both tips, with a midrib
                r = (lx / 0.62) ** 2 + (ly / (0.26 * (1 - np.abs(lx) / 0.7).clip(0.05))) ** 2
                inside = (r < 1) & (_hash(wx, wy, seed + 3) > 0.2)
                ci = (_hash(wx, wy, seed + 4) * len(palette)).astype(int) % len(palette)
                c = palette[ci] * (0.7 + 0.5 * (1 - r))[..., None]
                rib = (np.abs(ly) < 0.015) & inside
                c = np.where(rib[..., None], c * 0.6, c)
                alb = np.where(inside[..., None], c, alb)
                height = np.where(inside, 0.3 + layer * 0.15 + (1 - r) * 0.1, height)
    rough = 0.72 * np.ones_like(u)
    save('leaves', alb, rough, height, 3.0)


def bark():
    """Furrowed bark: vertical plates split by deep, wandering cracks."""
    u, v = grid()
    wob = (fbm(u, v, 4, 5, 141) - 0.5) * 0.35 + (fbm(u, v, 16, 3, 144) - 0.5) * 0.05
    plates = np.abs(np.sin((u * 18 + wob * 6) * np.pi))
    crack = 1 - smooth(0.0, 0.35, plates)
    plate_n = fbm(u, v, 32, 4, 142)
    alb = col((0.11, 0.08, 0.06), u.shape) * (0.55 + plate_n * 0.5)[..., None]
    alb = mix(alb, alb * 0.25, crack)
    lichen = smooth(0.66, 0.8, fbm(u, v, 8, 5, 143)) * (1 - crack)
    alb = mix(alb, col((0.24, 0.27, 0.17), u.shape), lichen * 0.55)
    rough = 0.88 + crack * 0.1
    height = (1 - crack) * 0.7 + plate_n * 0.25
    save('bark', alb, rough, height, 6.0)


def granite():
    """Mountain rock for cliffs, passes and the prison under the mountain."""
    u, v = grid()
    r = ridged(u, v, 4, 7, 151)
    speck = vnoise(u, v, 400, 152)
    strata = np.sin((v * 12 + fbm(u, v, 4, 5, 153) * 3) * np.pi * 2) * 0.5 + 0.5
    alb = col((0.24, 0.23, 0.22), u.shape) * (0.6 + r * 0.4 + speck * 0.15 + strata * 0.1)[..., None]
    rough = 0.75 + speck * 0.1
    height = r * 0.8 + strata * 0.15
    save('granite', alb, rough, height, 5.0)


def linen():
    u, v = grid(1024)
    t = 160
    over = (np.floor(u * t) + np.floor(v * t)) % 2
    across = np.where(over == 0, np.sin((v * t % 1) * np.pi), np.sin((u * t % 1) * np.pi))
    slub = fbm(u, v, 32, 3, 161)
    alb = col((0.62, 0.58, 0.5), u.shape) * (0.82 + across * 0.15 + (slub - 0.5) * 0.2)[..., None]
    save('linen', alb, 0.85 - across * 0.1, across * 0.6 + slub * 0.3, 1.5)


def leather():
    u, v = grid(1024)
    f1, f2, cid = voronoi(u, v, 220, 171, 1.0)
    pores = smooth(0.0, 0.25, f1)
    crease = ridged(u, v * 0.6, 6, 5, 172)
    wear = smooth(0.6, 0.8, fbm(u, v, 4, 5, 173))
    alb = col((0.07, 0.04, 0.022), u.shape) * (0.75 + crease * 0.4)[..., None]
    alb = mix(alb, alb * 1.9, wear)
    rough = 0.55 - wear * 0.2 + (1 - pores) * 0.15
    save('leather', alb, rough, pores * 0.2 + crease * 0.6, 2.0)


def parchment_wood():
    """Dark oak for the war table, shelves and doors."""
    u, v = grid()
    grain = np.sin((v * 60 + fbm(u, v * 0.3, 6, 6, 181) * 14) * np.pi) * 0.5 + 0.5
    pores = vnoise(u, v, 600, 182)
    alb = col((0.13, 0.075, 0.04), u.shape) * (0.6 + grain * 0.35 + pores * 0.1)[..., None]
    rough = 0.35 + grain * 0.15
    save('oak', alb, rough, grain * 0.2 + pores * 0.05, 1.5)


ALL = {
    'setts': setts, 'ashlar': ashlar, 'plaster': plaster, 'basalt': basalt, 'marble': marble,
    'timber': timber, 'slate': slate, 'thatch': thatch, 'grass': grass, 'mud': mud, 'snow': snow,
    'sand': sand, 'leaves': leaves, 'bark': bark, 'granite': granite, 'linen': linen,
    'leather': leather, 'oak': parchment_wood,
}

if __name__ == '__main__':
    names = args or list(ALL)
    for n in names:
        ALL[n]()
