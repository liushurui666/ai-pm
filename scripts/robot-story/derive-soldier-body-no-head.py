from __future__ import annotations

from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_MODEL = ROOT / "public/robot-story/models/Soldier.glb"
OUTPUT_MODEL = ROOT / "public/robot-story/models/SoldierBodyNoHead.glb"


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
