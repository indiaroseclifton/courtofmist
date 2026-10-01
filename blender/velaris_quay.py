"""Court of Mist: Velaris quay at night, path-traced in Blender Cycles.

Builds the whole shot procedurally (no external assets) and renders it:
wet setts with puddles, the Sidra, lit townhouses on both banks, a stone
bridge, lanterns in river mist, a silk-awning market, and Feyre from behind
with strand hair, a bow across her back and Illyrian boots.

Run with Blender 4.2+ or the `bpy` module:
    blender -b -P blender/velaris_quay.py -- --out docs/blender/quay.png --samples 256
    python blender/velaris_quay.py --out docs/blender/quay.png        # with `pip install bpy`
"""
import math
import random
import sys
import argparse

import bpy
import bmesh
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser()
ap.add_argument('--out', default='docs/blender/quay.png')
ap.add_argument('--samples', type=int, default=256)
ap.add_argument('--w', type=int, default=1920)
ap.add_argument('--h', type=int, default=1080)
ap.add_argument('--shot', default='quay', choices=['quay', 'wide'])
ap.add_argument('--blend', default='')
args = ap.parse_args(argv)

rnd = random.Random(7)

# ---------------------------------------------------------------- reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'


def link(obj, coll=None):
    (coll or scene.collection).objects.link(obj)
    return obj


def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree.nodes, m.node_tree.links, m.node_tree.nodes['Principled BSDF']


def node(nodes, kind, **inputs):
    n = nodes.new(kind)
    for k, v in inputs.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
        else:
            setattr(n, k, v)
    return n


def set_in(p, name, value):
    if name in p.inputs:
        p.inputs[name].default_value = value


def shade_smooth(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = True


# ---------------------------------------------------------------- materials
def mat_wet_setts():
    """Hand-laid basalt setts. Water sits in the joints and in shallow puddles."""
    m, n, l, p = new_mat('WetSetts')
    tc = node(n, 'ShaderNodeTexCoord')
    mp = node(n, 'ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (3.2, 4.4, 1)
    l.new(tc.outputs['Object'], mp.inputs['Vector'])
    # irregularity: warp the cell lattice a little so no two setts line up
    warp = node(n, 'ShaderNodeTexNoise', **{'Scale': 1.3, 'Detail': 2.0})
    l.new(mp.outputs['Vector'], warp.inputs['Vector'])
    mix_w = node(n, 'ShaderNodeMix', data_type='VECTOR')
    mix_w.inputs['Factor'].default_value = 0.12
    l.new(mp.outputs['Vector'], mix_w.inputs['A'])
    l.new(warp.outputs['Color'], mix_w.inputs['B'])
    vor = node(n, 'ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE')
    vor.inputs['Scale'].default_value = 1.0
    l.new(mix_w.outputs['Result'], vor.inputs['Vector'])
    vcol = node(n, 'ShaderNodeTexVoronoi')
    vcol.inputs['Scale'].default_value = 1.0
    l.new(mix_w.outputs['Result'], vcol.inputs['Vector'])
    joint = node(n, 'ShaderNodeMapRange', **{'From Min': 0.0, 'From Max': 0.08})
    l.new(vor.outputs['Distance'], joint.inputs['Value'])
    # stone tone per sett, plus grime
    ramp = node(n, 'ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.035, 0.034, 0.036, 1)
    ramp.color_ramp.elements[1].color = (0.13, 0.12, 0.115, 1)
    l.new(vcol.outputs['Color'], ramp.inputs['Fac'])
    grime = node(n, 'ShaderNodeTexNoise', **{'Scale': 9.0, 'Detail': 8.0, 'Roughness': 0.6})
    l.new(mp.outputs['Vector'], grime.inputs['Vector'])
    mulc = node(n, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    mulc.inputs['Factor'].default_value = 0.55
    l.new(ramp.outputs['Color'], mulc.inputs['A'])
    l.new(grime.outputs['Color'], mulc.inputs['B'])
    # puddles: big soft noise thresholded
    pud = node(n, 'ShaderNodeTexNoise', **{'Scale': 0.11, 'Detail': 3.0})
    tcw = node(n, 'ShaderNodeMapping')
    l.new(tc.outputs['Object'], tcw.inputs['Vector'])
    l.new(tcw.outputs['Vector'], pud.inputs['Vector'])
    pmask = node(n, 'ShaderNodeMapRange', **{'From Min': 0.5, 'From Max': 0.56})
    l.new(pud.outputs['Fac'], pmask.inputs['Value'])
    # wetness = joints OR puddles
    inv_joint = node(n, 'ShaderNodeMath', operation='SUBTRACT')
    inv_joint.inputs[0].default_value = 1.0
    l.new(joint.outputs['Result'], inv_joint.inputs[1])
    wet = node(n, 'ShaderNodeMath', operation='MAXIMUM', use_clamp=True)
    l.new(inv_joint.outputs['Value'], wet.inputs[0])
    l.new(pmask.outputs['Result'], wet.inputs[1])
    dark = node(n, 'ShaderNodeMix', data_type='RGBA')
    dark.inputs['B'].default_value = (0.012, 0.012, 0.013, 1)
    l.new(wet.outputs['Value'], dark.inputs['Factor'])
    l.new(mulc.outputs['Result'], dark.inputs['A'])
    l.new(dark.outputs['Result'], p.inputs['Base Color'])
    rough = node(n, 'ShaderNodeMapRange', **{'To Min': 0.42, 'To Max': 0.03})
    l.new(wet.outputs['Value'], rough.inputs['Value'])
    l.new(rough.outputs['Result'], p.inputs['Roughness'])
    # relief: domed setts, flattened where water fills
    flat = node(n, 'ShaderNodeMath', operation='MULTIPLY')
    l.new(joint.outputs['Result'], flat.inputs[0])
    one_minus_p = node(n, 'ShaderNodeMath', operation='SUBTRACT')
    one_minus_p.inputs[0].default_value = 1.0
    l.new(pmask.outputs['Result'], one_minus_p.inputs[1])
    l.new(one_minus_p.outputs['Value'], flat.inputs[1])
    bump = node(n, 'ShaderNodeBump', **{'Strength': 0.55, 'Distance': 0.02})
    l.new(flat.outputs['Value'], bump.inputs['Height'])
    fine = node(n, 'ShaderNodeBump', **{'Strength': 0.15, 'Distance': 0.004})
    l.new(grime.outputs['Fac'], fine.inputs['Height'])
    l.new(bump.outputs['Normal'], fine.inputs['Normal'])
    l.new(fine.outputs['Normal'], p.inputs['Normal'])
    set_in(p, 'Coat Weight', 0.0)
    return m


def mat_stone(tone=(0.42, 0.39, 0.35), scale=1.4, name='Ashlar'):
    m, n, l, p = new_mat(name)
    tc = node(n, 'ShaderNodeTexCoord')
    br = node(n, 'ShaderNodeTexBrick', **{'Scale': scale, 'Mortar Size': 0.012, 'Bias': 0.0, 'Brick Width': 0.9, 'Row Height': 0.36})
    br.inputs['Color1'].default_value = (*tone, 1)
    br.inputs['Color2'].default_value = tuple(c * 0.82 for c in tone) + (1,)
    br.inputs['Mortar'].default_value = (0.08, 0.075, 0.07, 1)
    l.new(tc.outputs['Object'], br.inputs['Vector'])
    noise = node(n, 'ShaderNodeTexNoise', **{'Scale': 6.0, 'Detail': 10.0, 'Roughness': 0.65})
    l.new(tc.outputs['Object'], noise.inputs['Vector'])
    # rain streaks down the face
    streak_map = node(n, 'ShaderNodeMapping')
    streak_map.inputs['Scale'].default_value = (6, 6, 0.25)
    l.new(tc.outputs['Object'], streak_map.inputs['Vector'])
    streak = node(n, 'ShaderNodeTexNoise', **{'Scale': 2.0, 'Detail': 4.0})
    l.new(streak_map.outputs['Vector'], streak.inputs['Vector'])
    sm = node(n, 'ShaderNodeMapRange', **{'From Min': 0.5, 'From Max': 0.75, 'To Min': 1.0, 'To Max': 0.45})
    l.new(streak.outputs['Fac'], sm.inputs['Value'])
    mul = node(n, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    mul.inputs['Factor'].default_value = 0.4
    l.new(br.outputs['Color'], mul.inputs['A'])
    l.new(noise.outputs['Color'], mul.inputs['B'])
    mul2 = node(n, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    mul2.inputs['Factor'].default_value = 1.0
    l.new(mul.outputs['Result'], mul2.inputs['A'])
    l.new(sm.outputs['Result'], mul2.inputs['B'])
    l.new(mul2.outputs['Result'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.78
    bump = node(n, 'ShaderNodeBump', **{'Strength': 0.35, 'Distance': 0.02})
    l.new(br.outputs['Fac'], bump.inputs['Height'])
    b2 = node(n, 'ShaderNodeBump', **{'Strength': 0.2, 'Distance': 0.01})
    l.new(noise.outputs['Fac'], b2.inputs['Height'])
    l.new(bump.outputs['Normal'], b2.inputs['Normal'])
    l.new(b2.outputs['Normal'], p.inputs['Normal'])
    return m


def mat_plaster(tone):
    """Painted lime plaster, faded and flaking: the Rainbow."""
    m, n, l, p = new_mat('Plaster')
    tc = node(n, 'ShaderNodeTexCoord')
    nz = node(n, 'ShaderNodeTexNoise', **{'Scale': 3.0, 'Detail': 12.0, 'Roughness': 0.7})
    l.new(tc.outputs['Object'], nz.inputs['Vector'])
    flake = node(n, 'ShaderNodeMapRange', **{'From Min': 0.6, 'From Max': 0.62})
    l.new(nz.outputs['Fac'], flake.inputs['Value'])
    mix = node(n, 'ShaderNodeMix', data_type='RGBA')
    mix.inputs['A'].default_value = (*tone, 1)
    mix.inputs['B'].default_value = (0.5, 0.47, 0.42, 1)
    l.new(flake.outputs['Result'], mix.inputs['Factor'])
    l.new(mix.outputs['Result'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.85
    b = node(n, 'ShaderNodeBump', **{'Strength': 0.3, 'Distance': 0.01})
    l.new(nz.outputs['Fac'], b.inputs['Height'])
    l.new(b.outputs['Normal'], p.inputs['Normal'])
    return m


def mat_glass_lit(strength, temp=2400):
    m, n, l, p = new_mat(f'Window{strength:.1f}')
    bb = node(n, 'ShaderNodeBlackbody')
    bb.inputs['Temperature'].default_value = temp
    l.new(bb.outputs['Color'], p.inputs['Emission Color'])
    p.inputs['Emission Strength'].default_value = strength
    p.inputs['Base Color'].default_value = (0.02, 0.02, 0.02, 1)
    p.inputs['Roughness'].default_value = 0.08
    return m


def mat_simple(name, color, rough=0.5, metal=0.0, **extra):
    m, n, l, p = new_mat(name)
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    for k, v in extra.items():
        set_in(p, k.replace('_', ' '), v)
    return m


def mat_cloth(name, color, sheen=0.6, weave=220.0, rough=0.82, silk=False):
    """Woven cloth: a visible warp and weft in the bump, sheen at grazing angles."""
    m, n, l, p = new_mat(name)
    tc = node(n, 'ShaderNodeTexCoord')
    w1 = node(n, 'ShaderNodeTexWave', wave_type='BANDS', bands_direction='X')
    w1.inputs['Scale'].default_value = weave
    w2 = node(n, 'ShaderNodeTexWave', wave_type='BANDS', bands_direction='Y')
    w2.inputs['Scale'].default_value = weave
    for w in (w1, w2):
        l.new(tc.outputs['UV' if silk else 'Object'], w.inputs['Vector'])
    mx = node(n, 'ShaderNodeMath', operation='MULTIPLY')
    l.new(w1.outputs['Fac'], mx.inputs[0])
    l.new(w2.outputs['Fac'], mx.inputs[1])
    slub = node(n, 'ShaderNodeTexNoise', **{'Scale': 40.0, 'Detail': 3.0})
    l.new(tc.outputs['Object'], slub.inputs['Vector'])
    tint = node(n, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    tint.inputs['Factor'].default_value = 0.25
    tint.inputs['A'].default_value = (*color, 1)
    l.new(slub.outputs['Color'], tint.inputs['B'])
    l.new(tint.outputs['Result'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = rough
    set_in(p, 'Sheen Weight', sheen)
    set_in(p, 'Sheen Roughness', 0.3 if silk else 0.6)
    if silk:
        set_in(p, 'Specular IOR Level', 0.7)
        p.inputs['Roughness'].default_value = 0.32
        set_in(p, 'Anisotropic', 0.6)
    b = node(n, 'ShaderNodeBump', **{'Strength': 0.25, 'Distance': 0.001})
    l.new(mx.outputs['Value'], b.inputs['Height'])
    l.new(b.outputs['Normal'], p.inputs['Normal'])
    return m


def mat_leather(name, color):
    m, n, l, p = new_mat(name)
    tc = node(n, 'ShaderNodeTexCoord')
    pores = node(n, 'ShaderNodeTexVoronoi')
    pores.inputs['Scale'].default_value = 320.0
    l.new(tc.outputs['Object'], pores.inputs['Vector'])
    crease = node(n, 'ShaderNodeTexNoise', **{'Scale': 14.0, 'Detail': 6.0, 'Distortion': 1.2})
    l.new(tc.outputs['Object'], crease.inputs['Vector'])
    wear = node(n, 'ShaderNodeMix', data_type='RGBA')
    wear.inputs['A'].default_value = (*color, 1)
    wear.inputs['B'].default_value = tuple(min(1, c * 1.9) for c in color) + (1,)
    wm = node(n, 'ShaderNodeMapRange', **{'From Min': 0.55, 'From Max': 0.75})
    l.new(crease.outputs['Fac'], wm.inputs['Value'])
    l.new(wm.outputs['Result'], wear.inputs['Factor'])
    l.new(wear.outputs['Result'], p.inputs['Base Color'])
    rr = node(n, 'ShaderNodeMapRange', **{'To Min': 0.62, 'To Max': 0.32})
    l.new(wm.outputs['Result'], rr.inputs['Value'])
    l.new(rr.outputs['Result'], p.inputs['Roughness'])
    b = node(n, 'ShaderNodeBump', **{'Strength': 0.2, 'Distance': 0.002})
    l.new(pores.outputs['Distance'], b.inputs['Height'])
    b2 = node(n, 'ShaderNodeBump', **{'Strength': 0.25, 'Distance': 0.004})
    l.new(crease.outputs['Fac'], b2.inputs['Height'])
    l.new(b.outputs['Normal'], b2.inputs['Normal'])
    l.new(b2.outputs['Normal'], p.inputs['Normal'])
    return m


def mat_skin(tone=(0.62, 0.42, 0.33)):
    m, n, l, p = new_mat('Skin')
    p.inputs['Base Color'].default_value = (*tone, 1)
    p.inputs['Roughness'].default_value = 0.48
    set_in(p, 'Subsurface Weight', 0.35)
    set_in(p, 'Subsurface Radius', (1.0, 0.35, 0.18))
    set_in(p, 'Subsurface Scale', 0.012)
    tc = node(n, 'ShaderNodeTexCoord')
    pores = node(n, 'ShaderNodeTexNoise', **{'Scale': 900.0, 'Detail': 2.0})
    l.new(tc.outputs['Object'], pores.inputs['Vector'])
    b = node(n, 'ShaderNodeBump', **{'Strength': 0.08, 'Distance': 0.0005})
    l.new(pores.outputs['Fac'], b.inputs['Height'])
    l.new(b.outputs['Normal'], p.inputs['Normal'])
    return m


def mat_hair(melanin=0.5, redness=0.6):
    m = bpy.data.materials.new('Hair')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    h = nt.nodes.new('ShaderNodeBsdfHairPrincipled')
    h.parametrization = 'MELANIN'
    h.inputs['Melanin'].default_value = melanin
    h.inputs['Melanin Redness'].default_value = redness
    h.inputs['Roughness'].default_value = 0.28
    if 'Radial Roughness' in h.inputs:
        h.inputs['Radial Roughness'].default_value = 0.4
    # per-strand variation: some lighter, sun-faded strands
    info = nt.nodes.new('ShaderNodeHairInfo')
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['To Min'].default_value = melanin * 0.75
    mr.inputs['To Max'].default_value = melanin * 1.15
    nt.links.new(info.outputs['Random'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], h.inputs['Melanin'])
    nt.links.new(h.outputs[0], out.inputs['Surface'])
    return m


def mat_water():
    """The Sidra: near-black, glassy, with long slow swells and fine chop."""
    m, n, l, p = new_mat('Sidra')
    p.inputs['Base Color'].default_value = (0.004, 0.012, 0.016, 1)
    p.inputs['Roughness'].default_value = 0.035
    p.inputs['IOR'].default_value = 1.333
    tc = node(n, 'ShaderNodeTexCoord')
    mp = node(n, 'ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (0.35, 1.0, 1.0)
    l.new(tc.outputs['Object'], mp.inputs['Vector'])
    swell = node(n, 'ShaderNodeTexNoise', **{'Scale': 0.9, 'Detail': 4.0, 'Roughness': 0.55})
    chop = node(n, 'ShaderNodeTexNoise', **{'Scale': 7.0, 'Detail': 6.0, 'Roughness': 0.5})
    l.new(mp.outputs['Vector'], swell.inputs['Vector'])
    l.new(tc.outputs['Object'], chop.inputs['Vector'])
    b1 = node(n, 'ShaderNodeBump', **{'Strength': 0.35, 'Distance': 0.2})
    l.new(swell.outputs['Fac'], b1.inputs['Height'])
    b2 = node(n, 'ShaderNodeBump', **{'Strength': 0.12, 'Distance': 0.03})
    l.new(chop.outputs['Fac'], b2.inputs['Height'])
    l.new(b1.outputs['Normal'], b2.inputs['Normal'])
    l.new(b2.outputs['Normal'], p.inputs['Normal'])
    return m


def mat_emit(name, temp, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    e = nt.nodes.new('ShaderNodeEmission')
    bb = nt.nodes.new('ShaderNodeBlackbody')
    bb.inputs['Temperature'].default_value = temp
    nt.links.new(bb.outputs['Color'], e.inputs['Color'])
    e.inputs['Strength'].default_value = strength
    nt.links.new(e.outputs[0], out.inputs['Surface'])
    return m


M = {
    'setts': mat_wet_setts(),
    'ashlar': mat_stone(),
    'ashlar_dark': mat_stone((0.24, 0.23, 0.22), 1.2, 'AshlarDark'),
    'quay': mat_stone((0.3, 0.29, 0.27), 0.9, 'QuayWall'),
    'slate': mat_simple('Slate', (0.03, 0.033, 0.04), 0.38),
    'iron': mat_simple('Iron', (0.02, 0.02, 0.022), 0.45, 0.9),
    'timber': mat_leather('Timber', (0.09, 0.055, 0.03)),
    'water': mat_water(),
    'lamp': mat_emit('LampGlass', 2300, 12.0),
    'candle': mat_emit('Candle', 1900, 40.0),
    'frame': mat_simple('WindowFrame', (0.05, 0.04, 0.03), 0.6),
    'glass_dark': mat_simple('GlassDark', (0.01, 0.012, 0.015), 0.05),
    'shutter_teal': mat_simple('ShutterTeal', (0.06, 0.12, 0.12), 0.7),
    'shutter_brown': mat_simple('ShutterBrown', (0.1, 0.06, 0.035), 0.7),
    'linen': mat_cloth('Linen', (0.62, 0.57, 0.48), 0.55, 260.0, 0.85),
    'vest': mat_leather('VestLeather', (0.06, 0.032, 0.018)),
    'trousers': mat_cloth('Wool', (0.035, 0.032, 0.03), 0.4, 300.0, 0.9),
    'boots': mat_leather('BootLeather', (0.035, 0.022, 0.014)),
    'skin': mat_skin(),
    'hair': mat_hair(0.62, 0.38),
    'bow': mat_simple('Yew', (0.16, 0.07, 0.03), 0.35, Coat_Weight=0.3),
    'string': mat_simple('Bowstring', (0.6, 0.55, 0.45), 0.6),
}
WINDOWS = [mat_glass_lit(s) for s in (1.6, 3.0, 4.5, 6.5)]
SILKS = [mat_cloth(f'Silk{i}', c, 1.0, 600.0, silk=True) for i, c in enumerate([
    (0.32, 0.03, 0.05), (0.04, 0.08, 0.3), (0.5, 0.3, 0.05), (0.05, 0.22, 0.14), (0.2, 0.05, 0.28)])]
PLASTERS = [mat_plaster(c) for c in [(0.48, 0.2, 0.1), (0.55, 0.38, 0.12), (0.12, 0.3, 0.3), (0.45, 0.2, 0.26), (0.2, 0.25, 0.42)]]


# ---------------------------------------------------------------- geometry helpers
def box(name, size, loc, mat, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        mod = o.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    o.data.materials.append(mat)
    return o


def cyl(name, r, h, loc, mat, verts=24, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, vertices=verts, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    shade_smooth(o)
    return o


# ---------------------------------------------------------------- the quay and the river
# Feyre walks +X along the south quay. The Sidra is on her left (+Y).
RIVER_Y0, RIVER_Y1 = 3.2, 30.0
ground = box('QuaySetts', (160, 40, 0.3), (40, -16.8, -0.15), M['setts'])
ground.modifiers.clear()
# the quay wall and its coping stones
box('QuayWall', (160, 0.8, 3.2), (40, RIVER_Y0 + 0.4, -1.6), M['quay'], 0.02)
box('Coping', (160, 0.95, 0.22), (40, RIVER_Y0 + 0.38, 0.1), M['ashlar_dark'], 0.03)
box('FarQuayWall', (160, 0.8, 3.2), (40, RIVER_Y1 - 0.4, -1.6), M['quay'], 0.02)
box('FarQuay', (160, 30, 0.3), (40, RIVER_Y1 + 15, -0.15), M['setts'])
bpy.ops.mesh.primitive_plane_add(size=1, location=(40, (RIVER_Y0 + RIVER_Y1) / 2, -1.2))
water = bpy.context.active_object
water.name = 'Sidra'
water.scale = (160, RIVER_Y1 - RIVER_Y0, 1)
bpy.ops.object.transform_apply(scale=True)
water.data.materials.append(M['water'])


# ---------------------------------------------------------------- townhouses
win_unit = None


def window_unit():
    """One window: recess frame, mullions, sill, glass. Linked duplicates share it."""
    global win_unit
    if win_unit:
        return win_unit
    bm = bmesh.new()
    for (sx, sy, sz, x, y, z) in [
        (1.1, 0.12, 0.1, 0, 0, -0.85),      # sill
        (1.0, 0.1, 0.08, 0, 0, 0.82),       # lintel
        (0.06, 0.06, 1.6, 0, 0.02, 0),      # mullion
        (0.9, 0.06, 0.05, 0, 0.02, 0.22),   # transom
        (0.06, 0.12, 1.66, -0.48, 0, 0),
        (0.06, 0.12, 1.66, 0.48, 0, 0),
    ]:
        r = bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=r['verts'])
        bmesh.ops.translate(bm, vec=(x, y, z), verts=r['verts'])
    me = bpy.data.meshes.new('WindowFrame')
    bm.to_mesh(me)
    bm.free()
    me.materials.append(M['frame'])
    win_unit = me
    return me


def townhouse(x, y, w, d, h, facing, mat, lit_p=0.4, plaster=False):
    """A narrow stone townhouse with real window recesses. facing=+1 faces +Y."""
    body = box(f'House_{x:.0f}_{y:.0f}', (w, d, h), (x, y, h / 2), mat, 0.03)
    # cornice and a pitched slate roof
    box('Cornice', (w + 0.3, d + 0.3, 0.25), (x, y, h + 0.12), M['ashlar_dark'], 0.04)
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=max(w, d) * 0.72, depth=min(w, d) * 0.45, location=(x, y, h + 0.25 + min(w, d) * 0.225), rotation=(0, 0, math.pi / 4))
    roof = bpy.context.active_object
    roof.scale = (w / max(w, d) * 1.0, d / max(w, d) * 1.0, 1)
    roof.data.materials.append(M['slate'])
    if rnd.random() < 0.7:
        box('Chimney', (0.6, 0.6, 1.8), (x + rnd.uniform(-w / 3, w / 3), y, h + 1.2), M['ashlar_dark'])
    face_y = y + facing * d / 2
    floors = int((h - 1.0) / 3.4)
    cols = max(1, int(w / 2.6))
    me = window_unit()
    for fl in range(floors):
        for c in range(cols):
            wx = x - w / 2 + (c + 0.5) * w / cols
            wz = 2.2 + fl * 3.4
            lit = rnd.random() < lit_p
            glass = box('Glass', (0.9, 0.04, 1.6), (wx, face_y + facing * 0.015, wz), rnd.choice(WINDOWS[1:]) if lit else M['glass_dark'])
            glass.modifiers.clear()
            fr = bpy.data.objects.new('Frame', me)
            fr.location = (wx, face_y + facing * 0.05, wz)
            fr.rotation_euler = (0, 0, 0 if facing > 0 else math.pi)
            link(fr)
            if not lit and rnd.random() < 0.4:
                sh = M['shutter_teal'] if rnd.random() < 0.5 else M['shutter_brown']
                for s in (-1, 1):
                    box('Shutter', (0.5, 0.05, 1.65), (wx + s * 0.75, face_y + facing * 0.03, wz), sh)
            if lit:
                # a warm light just inside the room, so the reveal and the sill catch it
                ld = bpy.data.lights.new('Room', 'POINT')
                ld.energy = rnd.uniform(4, 10)
                ld.color = (1.0, 0.62, 0.32)
                ld.shadow_soft_size = 0.4
                lo = bpy.data.objects.new('RoomLight', ld)
                lo.location = (wx, face_y + facing * 0.35, wz + 0.1)
                link(lo)
    # ground-floor door
    box('Door', (1.2, 0.1, 2.3), (x + rnd.uniform(-w / 4, w / 4), face_y + facing * 0.02, 1.15), M['shutter_brown'])
    return body


# near-side terrace on Feyre's right, facing the river
x = -18.0
while x < 70:
    w = rnd.uniform(5.5, 8.5)
    h = rnd.uniform(11, 17)
    mat = rnd.choice(PLASTERS) if x < 8 else M['ashlar']
    townhouse(x + w / 2, -9.5, w, 9, h, +1, mat, 0.45)
    x += w + 0.02
# far bank: the city across the Sidra, its windows doubled in the water
x = -30.0
while x < 110:
    w = rnd.uniform(6, 10)
    h = rnd.uniform(12, 24)
    townhouse(x + w / 2, RIVER_Y1 + 6, w, 10, h, -1, rnd.choice([M['ashlar'], M['ashlar'], PLASTERS[1], PLASTERS[2]]), 0.5)
    x += w + rnd.uniform(0.02, 2.5)


# ---------------------------------------------------------------- the bridge
def bridge(x0):
    span = RIVER_Y1 - RIVER_Y0 + 2
    bm = bmesh.new()
    segs = 40
    outer, inner = [], []
    for i in range(segs + 1):
        t = i / segs
        y = RIVER_Y0 - 1 + t * span
        deck = 0.25 + 2.6 * math.sin(math.pi * t)
        outer.append((y, deck))
        arch = -1.2 + 6.0 * max(0.0, math.sin(math.pi * (t - 0.12) / 0.76)) if 0.12 < t < 0.88 else -1.2
        inner.append((y, min(arch, deck - 0.9)))
    verts_l, verts_r = [], []
    for side, store in ((-2.4, verts_l), (2.4, verts_r)):
        ring = [bm.verts.new((x0 + side, y, z)) for (y, z) in outer] + [bm.verts.new((x0 + side, y, z)) for (y, z) in reversed(inner)]
        store.extend(ring)
    n = len(verts_l)
    bm.faces.new(verts_l)
    bm.faces.new(list(reversed(verts_r)))
    for i in range(n):
        a, b = verts_l[i], verts_l[(i + 1) % n]
        c, d = verts_r[(i + 1) % n], verts_r[i]
        bm.faces.new((a, b, c, d))
    me = bpy.data.meshes.new('Bridge')
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.materials.append(M['ashlar'])
    o = bpy.data.objects.new('Bridge', me)
    link(o)
    bpy.context.view_layer.objects.active = o
    # parapets with lanterns
    for side in (-2.2, 2.2):
        for i in range(0, segs + 1, 2):
            t = i / segs
            y = RIVER_Y0 - 1 + t * span
            z = 0.25 + 2.6 * math.sin(math.pi * t)
            box('Parapet', (0.35, span / segs * 2 + 0.02, 0.9), (x0 + side, y, z + 0.45), M['ashlar_dark'])
        for t in (0.15, 0.5, 0.85):
            y = RIVER_Y0 - 1 + t * span
            z = 0.25 + 2.6 * math.sin(math.pi * t)
            lantern((x0 + side, y, z + 0.9), post=1.8)
    return o


def lantern(base, post=3.2):
    x, y, z = base
    cyl('LampPost', 0.06, post, (x, y, z + post / 2), M['iron'], 10)
    box('LampCap', (0.42, 0.42, 0.06), (x, y, z + post + 0.33), M['iron'])
    g = box('LampGlass', (0.3, 0.3, 0.42), (x, y, z + post + 0.08), M['lamp'])
    g.visible_shadow = False
    ld = bpy.data.lights.new('Lantern', 'POINT')
    ld.energy = 80
    ld.color = (1.0, 0.6, 0.3)
    ld.shadow_soft_size = 0.12
    lo = bpy.data.objects.new('LanternLight', ld)
    lo.location = (x, y, z + post + 0.08)
    link(lo)


bridge(46)
for lx in range(-14, 64, 9):
    lantern((lx, RIVER_Y0 - 0.9, 0))
for lx in range(-24, 100, 12):
    lantern((lx, RIVER_Y1 + 0.9, 0))


# ---------------------------------------------------------------- the market
def stall(x, y, silk):
    box('StallTop', (3.2, 1.4, 0.08), (x, y, 0.92), M['timber'])
    for dx in (-1.5, 1.5):
        for dy in (-0.62, 0.62):
            box('StallPost', (0.09, 0.09, 2.5 if dy < 0 else 2.1), (x + dx, y + dy, 1.25 if dy < 0 else 1.05), M['timber'])
    # awning: a sloping sheet of silk, sagging between its poles
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=24, y_subdivisions=12, size=1, location=(x, y + 0.15, 2.25))
    aw = bpy.context.active_object
    aw.scale = (3.5, 2.0, 1)
    bpy.ops.object.transform_apply(scale=True)
    for v in aw.data.vertices:
        u = v.co.x / 1.75
        t = v.co.y / 2.0 + 0.5
        # sag between the poles and a slight ripple along the hem
        v.co.z = -0.07 * (1 - u * u) - 0.05 * math.sin(math.pi * t) + 0.012 * math.sin(v.co.x * 9 + t * 3) * t
    aw.rotation_euler = (math.radians(-20), 0, 0)
    aw.data.materials.append(silk)
    sol = aw.modifiers.new('Thickness', 'SOLIDIFY')
    sol.thickness = 0.004
    aw.modifiers.new('Subd', 'SUBSURF').levels = 1
    shade_smooth(aw)
    # bolts of silk, jars, a candle with its flame
    for k in range(5):
        cyl('Bolt', 0.11, 0.75, (x - 1.2 + k * 0.6, y - 0.2 + (k % 2) * 0.35, 1.07), rnd.choice(SILKS), 20, rot=(0, math.pi / 2, 0))
    for k in range(3):
        cyl('Jar', 0.07, 0.18, (x + 1.1 - k * 0.18, y + 0.45, 1.05), mat_simple('Clay', (0.3, 0.16, 0.08), 0.6), 16)
    cyl('Candle', 0.025, 0.16, (x - 1.4, y + 0.5, 1.04), mat_simple('Wax', (0.8, 0.74, 0.62), 0.5, Subsurface_Weight=0.5), 12)
    fl = cyl('Flame', 0.012, 0.035, (x - 1.4, y + 0.5, 1.145), M['candle'], 8)
    fl.visible_shadow = False
    ld = bpy.data.lights.new('CandleLight', 'POINT')
    ld.energy = 3.0
    ld.color = (1.0, 0.5, 0.2)
    ld.shadow_soft_size = 0.01
    lo = bpy.data.objects.new('Candle', ld)
    lo.location = (x - 1.4, y + 0.5, 1.16)
    link(lo)
    ld2 = bpy.data.lights.new('StallLamp', 'POINT')
    ld2.energy = 35
    ld2.color = (1.0, 0.58, 0.28)
    lo2 = bpy.data.objects.new('StallLamp', ld2)
    lo2.location = (x, y - 0.5, 2.0)
    link(lo2)


for i, sx in enumerate([3.5, 8.0, 12.5, 17.0, 21.5, 26.0]):
    stall(sx, -3.4, SILKS[i % len(SILKS)])


# ---------------------------------------------------------------- people
def groom(parent, length, count=9000, pts=14):
    """Strand hair as Curves: each strand leaves the scalp along its normal, then falls,
    draping over the skull, neck and shoulders. Clumped, slightly wavy, thinning at the tips."""
    import numpy as np
    r = np.random.default_rng(3)
    C = np.array([0.0, 0.012, 1.632])           # skull centre (local)
    R = 0.112
    pos = np.zeros((count, pts, 3), dtype=np.float32)
    rad = np.zeros((count, pts), dtype=np.float32)
    # clump guides: strands share a direction and wave with their nearest guide
    guides = r.normal(size=(140, 3)) * [1, 1, 0.3]
    for i in range(count):
        # roots over crown and back of the head, parting a little off-centre; face left clear
        while True:
            d = r.normal(size=3)
            d /= np.linalg.norm(d)
            if d[2] > -0.15 and d[1] < 0.35 and not (d[1] > 0.1 and d[2] < 0.35):
                break
        root = C + d * R * np.array([0.94, 1.02, 1.06])
        g = guides[i % len(guides)]
        L = length * r.uniform(0.75, 1.08)
        seg = L / (pts - 1)
        p = root.copy()
        v = d * 0.9 + np.array([0.0, -0.25, 0.0])
        wave_phase = r.uniform(0, 6.28)
        for k in range(pts):
            pos[i, k] = p
            t = k / (pts - 1)
            rad[i, k] = 0.000045 * (1 - 0.85 * t)
            v = v * 0.55 + np.array([0.0, -0.05, -1.0]) * 0.45 + g * 0.04
            v += np.array([np.sin(wave_phase + k * 0.9), 0, 0]) * 0.06 * t
            v /= np.linalg.norm(v)
            p = p + v * seg
            # collide: skull
            dv = p - C
            dist = np.linalg.norm(dv * [1 / 0.94, 1 / 1.02, 1 / 1.06])
            if dist < R * 1.03:
                p = C + dv / dist * R * 1.03
            # neck and shoulders: a capsule down the spine, wider below the neck
            if p[2] < 1.52:
                rr = 0.075 if p[2] > 1.44 else 0.2
                cy = -0.02
                hv = np.array([p[0], p[1] - cy])
                hl = np.linalg.norm(hv)
                if hl < rr:
                    hv = hv / (hl + 1e-6) * rr
                    p[0], p[1] = hv[0], hv[1] + cy
                if p[2] < 1.42 and abs(p[0]) < 0.2 and p[1] > -0.17:
                    p[1] = -0.17 - (0.2 - abs(p[0])) * 0.1   # over the vest, down the back
    cu = bpy.data.hair_curves.new('FeyreHair')
    cu.add_curves([pts] * count)
    cu.attributes['position'].data.foreach_set('vector', pos.reshape(-1))
    if 'radius' not in cu.attributes:
        cu.attributes.new('radius', 'FLOAT', 'POINT')
    cu.attributes['radius'].data.foreach_set('value', rad.reshape(-1))
    cu.materials.append(M['hair'])
    ho = bpy.data.objects.new('FeyreHair', cu)
    link(ho)
    ho.parent = parent
    return ho


def human(name, root, heading, height=1.68, stride=0.0, clothes=None, hair_len=0.0, strands=False, robe=None, skin_tone=None):
    """A body from a skin-modifier armature of vertices: organic surfaces, posed mid-stride."""
    c = clothes or {}
    s = height / 1.68
    ph = stride
    # joints in local space (Y forward, Z up)
    J = {
        'pelvis': (0, 0, 0.95), 'spine': (0, -0.01, 1.13), 'chest': (0, -0.015, 1.32), 'neck': (0, 0.0, 1.47),
        'head': (0, 0.02, 1.58), 'crown': (0, 0.01, 1.7),
    }
    for side, sx in (('L', -1), ('R', 1)):
        swing = math.sin(ph) * (1 if side == 'L' else -1)
        J[f'hip{side}'] = (sx * 0.09, 0, 0.93)
        J[f'knee{side}'] = (sx * 0.1, 0.22 * swing, 0.52 + 0.03 * abs(swing))
        J[f'ankle{side}'] = (sx * 0.1, 0.3 * swing - 0.1 * max(0, -swing), 0.09 + 0.08 * max(0, -swing))
        J[f'toe{side}'] = (sx * 0.1, 0.3 * swing + 0.16, 0.03 + 0.06 * max(0, -swing))
        J[f'shoulder{side}'] = (sx * 0.19, -0.02, 1.4)
        J[f'elbow{side}'] = (sx * 0.23, -0.16 * swing - 0.02, 1.13)
        J[f'wrist{side}'] = (sx * 0.24, -0.2 * swing + 0.08, 0.9)
        J[f'hand{side}'] = (sx * 0.24, -0.2 * swing + 0.1, 0.82)
    radii = {
        'pelvis': 0.15, 'spine': 0.125, 'chest': 0.15, 'neck': 0.05, 'head': 0.095, 'crown': 0.085,
        'hip': 0.085, 'knee': 0.055, 'ankle': 0.04, 'toe': 0.035, 'shoulder': 0.05, 'elbow': 0.04, 'wrist': 0.03, 'hand': 0.035,
    }
    edges = [('pelvis', 'spine'), ('spine', 'chest'), ('chest', 'neck'), ('neck', 'head'), ('head', 'crown')]
    for sd in 'LR':
        edges += [('pelvis', f'hip{sd}'), (f'hip{sd}', f'knee{sd}'), (f'knee{sd}', f'ankle{sd}'), (f'ankle{sd}', f'toe{sd}'),
                  ('chest', f'shoulder{sd}'), (f'shoulder{sd}', f'elbow{sd}'), (f'elbow{sd}', f'wrist{sd}'), (f'wrist{sd}', f'hand{sd}')]
    names = list(J)
    me = bpy.data.meshes.new(name)
    me.from_pydata([J[k] for k in names], [(names.index(a), names.index(b)) for a, b in edges], [])
    ob = bpy.data.objects.new(name, me)
    link(ob)
    skin = ob.modifiers.new('Skin', 'SKIN')
    skin.use_smooth_shade = True
    sv = me.skin_vertices[0].data
    for i, k in enumerate(names):
        base = k.rstrip('LR') if k not in radii else k
        r = radii.get(base, 0.05)
        rx = r * (1.25 if base in ('pelvis', 'chest', 'spine') else 1.0)
        ry = r * (0.8 if base in ('pelvis', 'chest', 'spine') else 1.0)
        sv[i].radius = (rx, ry)
        sv[i].use_root = k == 'pelvis'
    ob.modifiers.new('Subd', 'SUBSURF').levels = 2
    ob.modifiers['Subd'].render_levels = 2
    # clothing by height band: one body mesh, materials assigned per region after applying modifiers
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    for mat in (c.get('skin', M['skin']), c.get('shirt', M['linen']), c.get('vest', M['vest']), c.get('trousers', M['trousers']), c.get('boots', M['boots'])):
        ob.data.materials.append(mat)
    for poly in ob.data.polygons:
        z = poly.center.z
        ax = abs(poly.center.x)
        if z > 1.5:
            poly.material_index = 0                     # head and neck
        elif ax > 0.17 and z < 1.12:
            poly.material_index = 0                     # forearms, sleeves rolled
        elif ax > 0.17:
            poly.material_index = 1                     # sleeves
        elif z > 1.05:
            poly.material_index = 2 if z < 1.42 else 1  # vest over the torso, shirt at the collar
        elif z > 0.97:
            poly.material_index = 1                     # shirt tail, under the belt
        elif z > 0.44:
            poly.material_index = 3                     # trousers
        else:
            poly.material_index = 4                     # knee-high boots
        poly.use_smooth = True
    ob.scale = (s, s, s)
    ob.location = root
    ob.rotation_euler = (0, 0, heading)
    if robe:
        bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=0.34, radius2=0.17, depth=0.95, location=(0, 0, 0.5))
        rb = bpy.context.active_object
        rb.data.materials.append(robe)
        shade_smooth(rb)
        rb.parent = ob
    # hair: a scalp cap that grows particle strands, shaded with the Principled Hair BSDF
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.1, segments=32, ring_count=16, location=(0, -0.012, 1.615))
    cap = bpy.context.active_object
    cap.name = name + '_Scalp'
    cap.scale = (0.94, 1.05, 1.08)
    bpy.ops.object.transform_apply(scale=True)
    bm = bmesh.new()
    bm.from_mesh(cap.data)
    # keep the crown and back; the face stays clear
    kill = [v for v in bm.verts if v.co.z < 1.56 and v.co.y > -0.03 or v.co.z < 1.5]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(cap.data)
    bm.free()
    cap.data.materials.append(M['hair'])
    shade_smooth(cap)
    cap.parent = ob
    if strands and hair_len > 0:
        groom(ob, hair_len)
    return ob


# Feyre, mid-stride, the camera at her right shoulder
feyre = human('Feyre', (0, 0, 0), -math.pi / 2, 1.68, stride=0.7, hair_len=0.5, strands=True)
# bow across her back: yew limb, linen string; a quiver at her hip
curve = bpy.data.curves.new('BowCurve', 'CURVE')
curve.dimensions = '3D'
curve.bevel_depth = 0.011
curve.bevel_resolution = 3
sp = curve.splines.new('BEZIER')
sp.bezier_points.add(2)
for pt, co in zip(sp.bezier_points, [(-0.42, -0.16, 1.62), (0.0, -0.27, 1.2), (0.42, -0.16, 0.78)]):
    pt.co = co
    pt.handle_left_type = pt.handle_right_type = 'AUTO'
bow = bpy.data.objects.new('Bow', curve)
bow.data.materials.append(M['bow'])
link(bow)
bow.parent = feyre
scurve = bpy.data.curves.new('String', 'CURVE')
scurve.dimensions = '3D'
scurve.bevel_depth = 0.0018
ssp = scurve.splines.new('POLY')
ssp.points.add(1)
ssp.points[0].co = (-0.42, -0.15, 1.62, 1)
ssp.points[1].co = (0.42, -0.15, 0.78, 1)
string = bpy.data.objects.new('Bowstring', scurve)
string.data.materials.append(M['string'])
link(string)
string.parent = feyre
quiver = cyl('Quiver', 0.04, 0.46, (0.13, -0.19, 1.22), M['vest'], 20, rot=(0.25, 0.35, 0))
quiver.parent = feyre
for k in range(6):
    a = cyl('Shaft', 0.004, 0.3, (0.13 + (k % 3 - 1) * 0.015, -0.2 - 0.02 * (k // 3), 1.6), mat_simple('Ash', (0.3, 0.22, 0.14), 0.5), 6, rot=(0.25, 0.35, 0))
    a.parent = feyre
    f = box('Fletch', (0.004, 0.03, 0.09), (0.13 + (k % 3 - 1) * 0.015, -0.2 - 0.02 * (k // 3), 1.72), mat_simple('Feather', (0.55, 0.5, 0.42), 0.7))
    f.parent = feyre
belt = cyl('Belt', 0.175, 0.07, (0, 0, 0.985), M['boots'], 32)
belt.scale = (1.0, 0.82, 1)
belt.parent = feyre

# townsfolk along the quay and at the stalls
palette = [M['linen'], *SILKS]
for i in range(12):
    px = rnd.uniform(4, 40)
    py = rnd.uniform(-5.5, 1.6) if i < 9 else rnd.uniform(RIVER_Y1 + 1, RIVER_Y1 + 3)
    if 2 < px < 28 and -4.4 < py < -2.4:
        py = -1.6
    tone = rnd.choice([(0.6, 0.42, 0.33), (0.42, 0.26, 0.18), (0.25, 0.15, 0.1), (0.7, 0.52, 0.44)])
    sk = mat_skin(tone)
    human(f'Townsfolk{i}', (px, py, 0), rnd.uniform(-math.pi, math.pi), rnd.uniform(1.55, 1.85), rnd.uniform(-1, 1),
          clothes={'skin': sk, 'shirt': rnd.choice(palette), 'vest': rnd.choice([M['vest'], M['trousers'], SILKS[1]]), 'trousers': M['trousers']},
          robe=rnd.choice([None, None, rnd.choice(SILKS)]))


# ---------------------------------------------------------------- moon, sky, mist
world = bpy.data.worlds.new('Night')
scene.world = world
world.use_nodes = True
wn = world.node_tree.nodes
bg = wn['Background']
bg.inputs['Color'].default_value = (0.0035, 0.0055, 0.011, 1)
bg.inputs['Strength'].default_value = 1.0
moon = bpy.data.lights.new('Moon', 'SUN')
moon.energy = 0.09
moon.color = (0.62, 0.72, 0.95)
moon.angle = math.radians(0.6)
mo = bpy.data.objects.new('Moon', moon)
mo.rotation_euler = Euler((math.radians(58), 0, math.radians(200)))
link(mo)
# river mist: a low, thin volume that lanterns light up
bpy.ops.mesh.primitive_cube_add(size=1, location=(30, 5, 6))
fog = bpy.context.active_object
fog.name = 'Mist'
fog.scale = (180, 90, 14)
fm, fn, fl, fp = new_mat('Mist')
fn.remove(fp)
vol = fn.new('ShaderNodeVolumePrincipled')
vol.inputs['Density'].default_value = 0.0045
vol.inputs['Anisotropy'].default_value = 0.55
vol.inputs['Color'].default_value = (0.75, 0.8, 0.9, 1)
fl.new(vol.outputs[0], fn['Material Output'].inputs['Volume'])
fog.data.materials.append(fm)
fog.visible_shadow = False

# ---------------------------------------------------------------- camera: 35 mm, wide open
cam_data = bpy.data.cameras.new('Camera')
cam_data.lens = 35
cam_data.sensor_width = 36
cam_data.dof.use_dof = True
cam_data.dof.aperture_fstop = 2.0
cam_data.dof.aperture_blades = 7
cam = bpy.data.objects.new('Camera', cam_data)
link(cam)
scene.camera = cam
if args.shot == 'quay':
    cam.location = (-3.0, -0.9, 1.64)
    target = Vector((6.0, 4.6, 1.3))
    cam_data.dof.focus_distance = 3.0
else:
    cam.location = (-12, -2.5, 3.2)
    target = Vector((30, 10, 2.5))
    cam_data.dof.focus_distance = 11.0
direction = target - cam.location
cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

# ---------------------------------------------------------------- render
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = args.samples
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.02
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 8
scene.cycles.volume_bounces = 1
scene.cycles.volume_step_rate = 4.0
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False
scene.cycles.blur_glossy = 1.0
scene.cycles.sample_clamp_indirect = 6.0
scene.render.resolution_x = args.w
scene.render.resolution_y = args.h
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX'
try:
    scene.view_settings.look = 'AgX - Medium High Contrast'
except TypeError:
    pass
scene.view_settings.exposure = 0.0
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = args.out
if args.blend:
    bpy.ops.wm.save_as_mainfile(filepath=args.blend)
bpy.ops.render.render(write_still=True)
print('RENDERED', args.out)
