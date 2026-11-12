"""Quick clay renders of the figure that is open in Blender, to judge form before it goes into the game."""
import numpy as np
import bpy
import addon_utils
from mathutils import Vector


def render(path, views=(('front', 0), ('three', 35), ('side', 90), ('back', 180)), centre=(0, 0, 1.0), height=2.2, px=560, samples=24, clay=False):
    addon_utils.enable('cycles', default_set=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.device = 'CPU'
    sc.cycles.use_denoising = False
    sc.render.resolution_x = int(px * .62)
    sc.render.resolution_y = px
    sc.render.film_transparent = False
    w = bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (.5, .5, .55, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = .55
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.2
    sun.data.angle = .05
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = height
    sc.collection.objects.link(cam)
    sc.camera = cam
    if clay:
        m = bpy.data.materials.new('clay')
        m.use_nodes = True
        m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.62, .6, .58, 1)
        for ob in bpy.data.objects:
            if ob.type == 'MESH':
                ob.data.materials.clear()
                ob.data.materials.append(m)
    c = Vector(centre)
    out = []
    for name, deg in views:
        a = np.radians(deg)
        d = Vector((np.sin(a), -np.cos(a), .12))
        cam.location = c + d * 6
        cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
        ld = Vector((np.sin(a - .7), -np.cos(a - .7), .9))
        sun.rotation_euler = (-ld).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = path.replace('.png', f'-{name}.png')
        bpy.ops.render.render(write_still=True)
        out.append(sc.render.filepath)
    from PIL import Image
    ims = [Image.open(o) for o in out]
    sh = Image.new('RGB', (sum(i.width for i in ims), ims[0].height))
    x = 0
    for i in ims:
        sh.paste(i, (x, 0))
        x += i.width
    sh.save(path)
    return path
