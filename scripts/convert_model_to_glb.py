import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []

    parser = argparse.ArgumentParser(description="Convert architectural model to web preview GLB.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--target-faces", type=int, default=200000)
    parser.add_argument("--max-size", type=float, default=4.0)
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_model(input_path):
    extension = os.path.splitext(input_path)[1].lower()
    if extension == ".stl":
        bpy.ops.wm.stl_import(filepath=input_path)
    elif extension == ".obj":
        bpy.ops.wm.obj_import(filepath=input_path)
    elif extension == ".dae":
        bpy.ops.wm.collada_import(filepath=input_path)
    elif extension in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=input_path)
    else:
        raise ValueError(f"Unsupported model format: {extension}")


def ensure_clay_material():
    material = bpy.data.materials.new("Preview Clay")
    material.diffuse_color = (0.86, 0.88, 0.9, 1.0)
    return material


def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def apply_default_material(material):
    for obj in mesh_objects():
        if not obj.data.materials:
            obj.data.materials.append(material)


def count_faces():
    return sum(len(obj.data.polygons) for obj in mesh_objects())


def decimate_if_needed(target_faces):
    current_faces = count_faces()
    if current_faces <= target_faces or current_faces <= 0:
        return

    ratio = max(0.05, min(1.0, target_faces / current_faces))
    for obj in mesh_objects():
        modifier = obj.modifiers.new("Preview Decimate", "DECIMATE")
        modifier.ratio = ratio
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        finally:
            obj.select_set(False)


def normalize_scene(max_size):
    objects = mesh_objects()
    if not objects:
        raise ValueError("No mesh objects found in the model.")

    min_corner = Vector((math.inf, math.inf, math.inf))
    max_corner = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            min_corner.x = min(min_corner.x, world.x)
            min_corner.y = min(min_corner.y, world.y)
            min_corner.z = min(min_corner.z, world.z)
            max_corner.x = max(max_corner.x, world.x)
            max_corner.y = max(max_corner.y, world.y)
            max_corner.z = max(max_corner.z, world.z)

    center = (min_corner + max_corner) * 0.5
    size = max_corner - min_corner
    max_dimension = max(size.x, size.y, size.z)
    scale = max_size / max_dimension if max_dimension > 0 else 1.0

    for obj in objects:
        obj.location = (obj.location - center) * scale
        obj.scale = tuple(component * scale for component in obj.scale)


def export_glb(output_path):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        export_apply=True,
        export_materials="EXPORT",
    )


def main():
    args = parse_args()
    input_path = os.path.abspath(args.input)
    output_path = os.path.abspath(args.output)
    os.chdir(os.path.dirname(input_path))
    clear_scene()
    import_model(input_path)
    apply_default_material(ensure_clay_material())
    normalize_scene(args.max_size)
    decimate_if_needed(args.target_faces)
    export_glb(output_path)


if __name__ == "__main__":
    main()
