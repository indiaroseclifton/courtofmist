"""Turn generated material photos into tileable PBR sets matched to the game's look.
Runs in the Higgsfield sandbox (Pillow + numpy). usage:
  python3 textures.py <repo_dir> <out_dir> name=url [name=url ...]
For each name: <out>/<name>_albedo.jpg, _normal.jpg, _rough.jpg at 2048².
"""
import sys, os, io, urllib.request
import numpy as np
from PIL import Image, ImageFilter

# per material: normal strength, base roughness, roughness swing with darkness, structured?
SPEC = {
    'setts': (5.0, 0.55, 0.35, True), 'ashlar': (4.0, 0.8, 0.15, True), 'plaster': (2.0, 0.9, 0.08, False),
    'basalt': (5.0, 0.6, 0.3, False), 'marble': (1.0, 0.35, 0.1, False), 'timber': (3.5, 0.75, 0.15, True),
    'slate': (4.0, 0.6, 0.25, True), 'thatch': (6.0, 0.95, 0.05, True), 'grass': (4.0, 0.9, 0.08, False),
    'mud': (3.0, 0.55, 0.35, False), 'snow': (1.5, 0.75, 0.1, False), 'sand': (2.0, 0.92, 0.05, False),
    'bark': (7.0, 0.9, 0.08, True), 'granite': (4.5, 0.75, 0.15, False),
}
N = 2048

def load(url):
    with urllib.request.urlopen(url) as r: return Image.open(io.BytesIO(r.read())).convert('RGB')

def seam_error(a):
    return float(np.abs(a[:, 0] - a[:, -1]).mean() + np.abs(a[0] - a[-1]).mean()) / 2

def make_seamless(a, band):
    """Blend the half-rolled image into a narrow band at each edge; inside, the photo is untouched."""
    h, w, _ = a.shape
    rolled = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    y = np.minimum(np.arange(h), h - 1 - np.arange(h)) / (h * band)
    x = np.minimum(np.arange(w), w - 1 - np.arange(w)) / (w * band)
    my, mx = np.clip(y, 0, 1), np.clip(x, 0, 1)
    m = np.minimum.outer(my, mx)
    m = m * m * (3 - 2 * m)
    return a * m[..., None] + rolled * (1 - m[..., None])

def main():
    repo, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    for arg in sys.argv[3:]:
        name, url = arg.split('=', 1)
        strength, rbase, rswing, structured = SPEC[name]
        img = load(url).resize((N, N), Image.LANCZOS)
        a = np.asarray(img).astype(np.float32) / 255
        before = seam_error(a)
        if before > 0.02:
            a = make_seamless(a, 0.07 if structured else 0.18)
        # match the brightness and (half of) the colour of the procedural set the game was tuned on
        ref_path = os.path.join(repo, 'public/textures', f'{name}_albedo.jpg')
        if os.path.exists(ref_path):
            ref = np.asarray(Image.open(ref_path).convert('RGB')).astype(np.float32) / 255
            mean_a, mean_r = a.reshape(-1, 3).mean(0), ref.reshape(-1, 3).mean(0)
            lum = lambda c: float(c @ np.array([0.2126, 0.7152, 0.0722]))
            a = a * (lum(mean_r) / max(1e-4, lum(mean_a)))
            tint = (mean_r / max(1e-4, lum(mean_r))) / (mean_a / max(1e-4, lum(mean_a)))
            a = a * (1 + (tint - 1) * 0.5)
        a = np.clip(a, 0, 1)
        Image.fromarray((a * 255).astype(np.uint8)).save(f'{out}/{name}_albedo.jpg', quality=90)
        # height from luminance (high-passed so lighting gradients don't tilt the surface)
        L = a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        Li = Image.fromarray((L * 255).astype(np.uint8))
        low = np.asarray(Li.filter(ImageFilter.GaussianBlur(48))).astype(np.float32) / 255
        hgt = np.asarray(Li.filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255 - low
        dx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * strength
        dy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * strength
        n = np.stack([-dx, dy, np.ones_like(dx)], -1)
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
        Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(f'{out}/{name}_normal.jpg', quality=92)
        rough = np.clip(rbase + (0.5 - L) * rswing * 2, 0.05, 1)
        Image.fromarray((rough * 255).astype(np.uint8)).save(f'{out}/{name}_rough.jpg', quality=90)
        print(f'{name}: seam {before:.3f} -> {seam_error(a):.3f}, mean {a.mean():.3f}')

main()
