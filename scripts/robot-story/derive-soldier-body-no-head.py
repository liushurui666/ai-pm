from __future__ import annotations

from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_MODEL = ROOT / "public/robot-story/models/Soldier.glb"
OUTPUT_MODEL = ROOT / "public/robot-story/models/SoldierBodyNoHead.glb"
BLACK_PANEL_MATERIAL_NAME = "Robot story cool black armor panels"
CYAN_SIGNAL_MATERIAL_NAME = "Robot story cyan signal trims"


def clear_scene() -> None:
    """清空 Blender 默认场景，避免默认灯光、立方体或相机被混进运行时 GLB。"""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def remove_source_visor() -> None:
    """删除 Soldier 原始独立 visor；新页面只保留 DamagedHelmet 的官方面罩和眼口细节。"""
    visor = bpy.data.objects.get("vanguard_visor")

    if not visor:
        return

    bpy.data.objects.remove(visor, do_unlink=True)


def get_vertex_group_weight(vertex: bmesh.types.BMVert, deform_layer: bmesh.types.BMLayerItem, group_index: int) -> float:
    """读取 bmesh 顶点组权重；缺省权重按 0 处理，避免无权重顶点触发异常。"""
    return vertex[deform_layer].get(group_index, 0.0)


def create_cool_black_panel_material() -> bpy.types.Material:
    """创建黑色装甲分区材质，作为黑白占比优化的真实模型面材质。"""
    material = bpy.data.materials.new(BLACK_PANEL_MATERIAL_NAME)
    material.use_nodes = True
    material.diffuse_color = (0.01, 0.016, 0.028, 1.0)

    node = material.node_tree.nodes.get("Principled BSDF")

    if node:
        if "Base Color" in node.inputs:
            node.inputs["Base Color"].default_value = (0.01, 0.016, 0.028, 1.0)
        if "Metallic" in node.inputs:
            node.inputs["Metallic"].default_value = 0.88
        if "Roughness" in node.inputs:
            node.inputs["Roughness"].default_value = 0.18

    return material


def create_cyan_signal_material() -> bpy.types.Material:
    """创建少量冷青色信号材质，用于可落地的小面积科技点缀。"""
    material = bpy.data.materials.new(CYAN_SIGNAL_MATERIAL_NAME)
    material.use_nodes = True
    material.diffuse_color = (0.1, 0.92, 1.0, 1.0)

    node = material.node_tree.nodes.get("Principled BSDF")

    if node:
        if "Base Color" in node.inputs:
            node.inputs["Base Color"].default_value = (0.1, 0.92, 1.0, 1.0)
        if "Emission Color" in node.inputs:
            node.inputs["Emission Color"].default_value = (0.02, 0.75, 1.0, 1.0)
        if "Emission Strength" in node.inputs:
            node.inputs["Emission Strength"].default_value = 0.85
        if "Metallic" in node.inputs:
            node.inputs["Metallic"].default_value = 0.35
        if "Roughness" in node.inputs:
            node.inputs["Roughness"].default_value = 0.22

    return material


def is_cool_black_panel_face(center: Vector) -> bool:
    """按世界坐标选择更酷的黑色机甲分区，避免靠前端叠可见贴片。

    Soldier 的坐标在导入后存在对象缩放，使用世界坐标能稳定命中胸甲、上肋和前臂。
    这些区域都是结构化大块面，刻意避开腿部白甲和原始战损纹理，提升黑白占比但不引入旧化感。
    """
    x = center.x
    z = center.z
    abs_x = abs(x)
    is_clavicle_insert = 0.22 < abs_x < 0.46 and 1.34 < z < 1.54
    is_chest_side_wing = 0.27 < abs_x < 0.47 and 1.08 < z < 1.35
    is_upper_rib_insert = 0.22 < abs_x < 0.52 and 0.98 < z < 1.13
    is_abdomen_spine = abs_x < 0.13 and 0.86 < z < 1.08
    is_forearm_cuff = 0.58 < abs_x < 0.9 and 0.72 < z < 1.08

    return is_clavicle_insert or is_chest_side_wing or is_upper_rib_insert or is_abdomen_spine or is_forearm_cuff


def is_cyan_signal_face(center: Vector) -> bool:
    """选择极小面积的发光信号面，避免颜色点缀变成廉价大色块。"""
    x = center.x
    y = center.y
    z = center.z
    abs_x = abs(x)
    abs_y = abs(y)
    is_chest_scan_node = 0.105 < abs_x < 0.155 and 0.06 < abs_y < 0.16 and 1.2 < z < 1.28
    is_wrist_signal = 0.78 < abs_x < 0.88 and abs_y < 0.12 and 0.61 < z < 0.7

    return is_chest_scan_node or is_wrist_signal


def assign_cool_black_panel_faces() -> None:
    """把黑白科技分区写入派生 GLB，而不是依赖运行时额外几何贴片。"""
    body = bpy.data.objects.get("vanguard_Mesh")

    if not body or body.type != "MESH":
        raise RuntimeError("Soldier body mesh vanguard_Mesh was not found")

    black_material = create_cool_black_panel_material()
    cyan_material = create_cyan_signal_material()
    body.data.materials.append(black_material)
    black_material_index = len(body.data.materials) - 1
    body.data.materials.append(cyan_material)
    cyan_material_index = len(body.data.materials) - 1
    black_selected_count = 0
    cyan_selected_count = 0

    for polygon in body.data.polygons:
        center = sum((body.data.vertices[index].co for index in polygon.vertices), Vector()) / len(polygon.vertices)
        world_center = body.matrix_world @ center

        if is_cyan_signal_face(world_center):
            polygon.material_index = cyan_material_index
            cyan_selected_count += 1
        elif is_cool_black_panel_face(world_center):
            polygon.material_index = black_material_index
            black_selected_count += 1

    print(f"Assigned {black_selected_count} Soldier body faces to cool black armor panels")
    print(f"Assigned {cyan_selected_count} Soldier body faces to cyan signal trims")


def remove_head_faces_from_body() -> None:
    """从 Soldier 主体 SkinnedMesh 中删除原头盔面片，同时保留骨骼和动画。

    Three.js 运行时按 Head 权重过滤三角面会受缓存和权重边界影响，刷新后仍可能看到原头盔。
    这里在 Blender 派生资产阶段直接删除由 `mixamorig:Head` 主导的面，浏览器只需要加载无原头身体。
    """
    body = bpy.data.objects.get("vanguard_Mesh")

    if not body or body.type != "MESH":
        raise RuntimeError("Soldier body mesh vanguard_Mesh was not found")

    head_group = body.vertex_groups.get("mixamorig:Head")

    if not head_group:
        raise RuntimeError("Soldier Head vertex group was not found")

    mesh = body.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    deform_layer = bm.verts.layers.deform.active

    if deform_layer is None:
        bm.free()
        raise RuntimeError("Soldier body mesh has no deform layer")

    faces_to_remove: list[bmesh.types.BMFace] = []

    for face in bm.faces:
        head_weights = [get_vertex_group_weight(vertex, deform_layer, head_group.index) for vertex in face.verts]
        influenced_vertices = sum(1 for weight in head_weights if weight > 0.18)
        average_weight = sum(head_weights) / max(1, len(head_weights))

        # Soldier 的肩甲和身体也共用同一张 mesh，因此不能按坐标粗暴裁掉上半身。
        # 这里要求至少两个顶点明显受 Head 骨骼控制，并且平均权重大于阈值，只删除真正会和新头盔重叠的原头盔面。
        if influenced_vertices >= 2 and average_weight > 0.14:
            faces_to_remove.append(face)

    bmesh.ops.delete(bm, geom=faces_to_remove, context="FACES")
    loose_vertices = [vertex for vertex in bm.verts if not vertex.link_faces]
    bmesh.ops.delete(bm, geom=loose_vertices, context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    print(f"Removed {len(faces_to_remove)} source helmet faces and {len(loose_vertices)} loose vertices from Soldier body")


def derive_soldier_body_no_head() -> None:
    """生成无原头 Soldier 身体 GLB，作为 `/robot-story` 的稳定运行时模型。"""
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(SOURCE_MODEL))
    remove_source_visor()
    remove_head_faces_from_body()
    assign_cool_black_panel_faces()

    OUTPUT_MODEL.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_MODEL),
        export_format="GLB",
        export_animations=True,
        export_skins=True,
        export_morph=True,
        export_materials="EXPORT",
    )

    print(f"Derived Soldier body without source helmet written to {OUTPUT_MODEL}")


if __name__ == "__main__":
    derive_soldier_body_no_head()
