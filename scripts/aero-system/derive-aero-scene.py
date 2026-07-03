#!/usr/bin/env python3
"""基于 15 个原始 Aero GLB 派生 AI PM 航线首页可用的分体模型包。

这个脚本承担 Blender 侧的主流程：原始 GLB 只作为底模保留，页面运行时只加载
`public/aero-system/models/derived/<model-id>/model.glb`。这样当视觉偏差过大时，
可以回到 Blender 重新打磨某一个派生模型，而不是在 Three.js 里硬凑形体。
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Callable, TypedDict

import bpy
from mathutils import Vector


REPO_ROOT = Path(__file__).resolve().parents[2]
MODEL_ROOT = REPO_ROOT / "public" / "aero-system" / "models"
SOURCE_DIR = MODEL_ROOT / "source"
DERIVED_DIR = MODEL_ROOT / "derived"
BLENDER_DERIVED_DIR = REPO_ROOT / "assets" / "aero-system" / "blender" / "derived"
SCENE_MANIFEST_PATH = MODEL_ROOT / "aero-flight-scene.manifest.json"


ASSETS = {
    "airship": "Aero_Airship_01.glb",
    "door": "Aero_Door_01.glb",
    "ground_hex": "Aero_Ground_Hexagon_Art.glb",
    "ground_hexes_a": "Aero_Ground_Hexagons_01_Art.glb",
    "ground_hexes_b": "Aero_Ground_Hexagons_02_Art.glb",
    "lamp": "Aero_Lampost_01.glb",
    "station_main": "Aero_Station_01_Art.glb",
    "station_mini": "Aero_Station_Mini_Platform_Art.glb",
    "station_pink": "Aero_Station_PinkRing_Art.glb",
    "station_ring": "Aero_Station_Ring_Art.glb",
    "station_yellow": "Aero_Station_YellowRing_Art.glb",
    "island": "Floating_Island_01_Art.glb",
    "path": "Path_01_Art.glb",
    "terrain": "Terrain_Art.glb",
    "tree": "Tree_01_Art.glb",
}


CARDS = [
    {
        "accent": "#55f0c7",
        "id": "requirements",
        "index": "01",
        "metric": "进行中 12/20",
        "position": [-0.82, 0.62, -0.18],
        "status": "进行中",
        "summary": "收集需求，拆解任务",
        "title": "需求塔台",
    },
    {
        "accent": "#48a8ff",
        "id": "versions",
        "index": "02",
        "metric": "进行中 v1.2.3",
        "position": [-0.18, 0.12, 1.08],
        "status": "进行中",
        "summary": "规划版本，分配资源",
        "title": "版本航站",
    },
    {
        "accent": "#ffbb55",
        "id": "bugs",
        "index": "03",
        "metric": "进行中 5 个待处理",
        "position": [1.44, 0.12, 1.08],
        "status": "进行中",
        "summary": "发现问题，修复验证",
        "title": "Bug 维修坞",
    },
    {
        "accent": "#57e2a2",
        "id": "launch",
        "index": "04",
        "metric": "准备就绪 v1.2.3",
        "position": [2.24, 0.6, 0.14],
        "status": "准备就绪",
        "summary": "验收合规，发布上线",
        "title": "上线闸口",
    },
]


ROUTES = {
    "blue": {
        "color": "#4bd8ff",
        "points": [
            [-0.72, 0.12, -0.1],
            [-0.56, 0.04, 0.42],
            [-0.18, -0.08, 1.0],
            [0.54, 0.04, 0.72],
            [0.92, 0.2, -0.04],
        ],
    },
    "orange": {
        "color": "#ffc35c",
        "points": [
            [0.92, 0.2, -0.04],
            [1.16, 0.02, 0.66],
            [1.42, -0.06, 1.08],
            [1.78, 0.1, 0.74],
            [2.24, 0.28, 0.14],
        ],
    },
}


FLIGHT_PATH = [
    [-0.34, 0.28, 0.58],
    [0.54, 0.38, 0.36],
    [1.14, 0.42, 0.72],
    [1.72, 0.46, 0.62],
    [2.14, 0.45, 0.18],
]


class DerivedModelSpec(TypedDict):
    id: str
    title: str
    role: str
    placement: dict[str, list[float]]
    sourceKeys: list[str]
    builder: Callable[[], None]
    anchors: dict[str, list[float]]


def reset_scene() -> None:
    """清空当前 Blender 场景，保证每个派生模型都是独立、可追溯的资产包。"""

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def ensure_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
    metallic: float = 0.0,
    roughness: float = 0.45,
    alpha: float = 1.0,
) -> bpy.types.Material:
    """创建或复用可导出到 glTF 的 PBR 材质。

    Blender 小版本会调整 Principled BSDF 的 socket 名，因此这里用存在性判断写入，
    避免升级 Blender 后导出流程被材质字段差异打断。
    """

    material = bpy.data.materials.get(name)
    if material:
        return material

    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    material.blend_method = "BLEND" if alpha < 1 else "OPAQUE"

    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled:
        inputs = principled.inputs
        if "Base Color" in inputs:
            inputs["Base Color"].default_value = color
        if "Metallic" in inputs:
            inputs["Metallic"].default_value = metallic
        if "Roughness" in inputs:
            inputs["Roughness"].default_value = roughness
        if "Alpha" in inputs:
            inputs["Alpha"].default_value = alpha
        if emission and "Emission Color" in inputs:
            inputs["Emission Color"].default_value = emission
        if "Emission Strength" in inputs:
            inputs["Emission Strength"].default_value = emission_strength

    return material


def materials() -> dict[str, bpy.types.Material]:
    """集中维护派生模型使用的材质标签，前端也会按这些名字做二次校色。"""

    return {
        "rock": ensure_material("AI_PM_dark_floating_rock", (0.014, 0.018, 0.023, 1), metallic=0.03, roughness=0.88),
        "terrain": ensure_material(
            "AI_PM_dark_terrain_surface",
            (0.038, 0.105, 0.072, 1),
            emission=(0.0, 0.046, 0.032, 1),
            emission_strength=0.04,
            metallic=0.05,
            roughness=0.88,
        ),
        "foliage": ensure_material(
            "AI_PM_dark_foliage",
            (0.02, 0.105, 0.07, 1),
            emission=(0.0, 0.05, 0.03, 1),
            emission_strength=0.02,
            metallic=0.0,
            roughness=0.92,
        ),
        "pad": ensure_material(
            "AI_PM_station_dark_metal",
            (0.044, 0.058, 0.068, 1),
            emission=(0.01, 0.045, 0.06, 1),
            emission_strength=0.08,
            metallic=0.76,
            roughness=0.3,
        ),
        "cyan": ensure_material(
            "AI_PM_neon_cyan",
            (0.06, 0.92, 1.0, 1),
            emission=(0.0, 0.8, 1.0, 1),
            emission_strength=3.4,
            metallic=0.12,
            roughness=0.16,
        ),
        "blue": ensure_material(
            "AI_PM_route_blue",
            (0.05, 0.42, 1.0, 1),
            emission=(0.02, 0.34, 1.0, 1),
            emission_strength=2.9,
            metallic=0.18,
            roughness=0.18,
        ),
        "orange": ensure_material(
            "AI_PM_route_orange",
            (1.0, 0.56, 0.08, 1),
            emission=(1.0, 0.38, 0.04, 1),
            emission_strength=3.0,
            metallic=0.18,
            roughness=0.18,
        ),
        "magenta": ensure_material(
            "AI_PM_neon_magenta",
            (1.0, 0.18, 0.78, 1),
            emission=(1.0, 0.1, 0.72, 1),
            emission_strength=2.7,
            metallic=0.18,
            roughness=0.22,
        ),
        "glass": ensure_material(
            "AI_PM_hologram_glass",
            (0.22, 0.92, 0.86, 0.34),
            emission=(0.08, 0.72, 0.82, 1),
            emission_strength=0.86,
            metallic=0.0,
            roughness=0.1,
            alpha=0.34,
        ),
        "airship": ensure_material(
            "AI_PM_airship_warm_metal",
            (0.62, 0.68, 0.72, 1),
            emission=(0.08, 0.16, 0.22, 1),
            emission_strength=0.18,
            metallic=0.58,
            roughness=0.32,
        ),
    }


def get_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector, float]:
    """返回对象组世界包围盒，用于把不同来源 GLB 归一化到同一尺度。"""

    corners: list[Vector] = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            corners.append(obj.matrix_world @ Vector(corner))

    if not corners:
        return Vector((0, 0, 0)), Vector((1, 1, 1)), 1.0

    min_corner = Vector((min(point.x for point in corners), min(point.y for point in corners), min(point.z for point in corners)))
    max_corner = Vector((max(point.x for point in corners), max(point.y for point in corners), max(point.z for point in corners)))
    size = max_corner - min_corner
    return (min_corner + max_corner) * 0.5, size, max(size.x, size.y, size.z, 0.001)


def to_blender_location(location: tuple[float, float, float] | list[float]) -> tuple[float, float, float]:
    """把运行时 Three.js 坐标转换成 Blender 原生坐标。

    这个脚本的业务坐标统一按 Three.js 语义书写：`x` 是横向，`y` 是高度，
    `z` 是镜头深度。Blender 导出 GLB 时会把自身 Z-up 转为 glTF/Three 的 Y-up，
    因此如果不在入口处转换，原本想做“上下层级”的圆盘和岛体会被错放到深度轴，
    浏览器里就会读成几张贴片叠在一起。转换规则来自最小 GLB 导出验证：
    Blender `(0, 1, 0)` -> Three `[0, 0, -1]`，Blender `(0, 0, 1)` -> Three `[0, 1, 0]`。
    """

    x, y, z = location
    return (x, -z, y)


def to_blender_rotation(rotation: tuple[float, float, float]) -> tuple[float, float, float]:
    """把运行时欧拉角语义转换成 Blender 欧拉角。

    首页派生模型绝大多数只需要绕 Three.js 的 Y 轴做朝向旋转。统一映射后，
    `rotation=(0, yaw, 0)` 会真正变成 Blender Z 轴旋转，避免窗口带、泊位和桥体
    沿错误轴展开。
    """

    rx, ry, rz = rotation
    return (rx, -rz, ry)


def to_blender_scale(scale: tuple[float, float, float]) -> tuple[float, float, float]:
    """把 Three.js 语义的非等比缩放映射到 Blender 轴向。"""

    sx, sy, sz = scale
    return (sx, sz, sy)


def polish_mesh_object(obj: bpy.types.Object, *, smooth: bool = True, bevel: float = 0.0) -> bpy.types.Object:
    """给程序化几何做基础圆润处理，降低低模拼贴感。

    目标图的空间站和浮岛虽然是科幻风，但边缘不是硬邦邦的纯低多边形；这里在 Blender
    侧给导出资产加平滑和微倒角，避免把质感问题推给 Three.js 后期。
    """

    if obj.type != "MESH":
        return obj

    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True

    if bevel > 0:
        modifier = obj.modifiers.new(f"{obj.name}_soft_bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        modifier.affect = "EDGES"
        weighted = obj.modifiers.new(f"{obj.name}_weighted_normals", "WEIGHTED_NORMAL")
        weighted.keep_sharp = True

    return obj


def add_organic_island_shell(
    name: str,
    material: bpy.types.Material,
    *,
    radius_x: float,
    radius_z: float,
    y: float,
    thickness: float,
    segments: int = 32,
) -> bpy.types.Object:
    """生成一体化悬浮岛岩壳，替代“圆盘 + 多个碎锥”的拼贴观感。

    目标图中的每个业务节点都是一块完整浮空地貌，上方承载站台，下方有连续岩壁。
    这里直接在 Blender 里生成闭合网格：上缘、下缘和底点都属于同一个 Mesh，
    浏览器滚动时才会像一个整体，而不是几层贴片互相穿插。
    """

    vertices: list[tuple[float, float, float]] = []
    top_indices: list[int] = []
    waist_indices: list[int] = []
    bottom_indices: list[int] = []

    for index in range(segments):
        angle = (index / segments) * math.pi * 2
        ridge_noise = 1 + math.sin(index * 1.7) * 0.055 + math.cos(index * 0.9) * 0.035
        x = math.cos(angle) * radius_x * ridge_noise
        z = math.sin(angle) * radius_z * (1 + math.cos(index * 1.3) * 0.05)
        vertices.append(to_blender_location((x, y + math.sin(index * 0.7) * 0.018, z)))
        top_indices.append(index)

    for index in range(segments):
        angle = (index / segments) * math.pi * 2
        waist_noise = 0.68 + (index % 5) * 0.018
        x = math.cos(angle) * radius_x * waist_noise
        z = math.sin(angle) * radius_z * (0.64 + (index % 4) * 0.016)
        vertices.append(to_blender_location((x, y - thickness * 0.48 + math.sin(index * 0.9) * 0.026, z)))
        waist_indices.append(segments + index)

    for index in range(segments):
        angle = (index / segments) * math.pi * 2
        bottom_noise = 0.26 + (index % 6) * 0.015
        x = math.cos(angle) * radius_x * bottom_noise
        z = math.sin(angle) * radius_z * (0.24 + (index % 5) * 0.012)
        vertices.append(to_blender_location((x, y - thickness * (0.92 + math.sin(index) * 0.05), z)))
        bottom_indices.append(segments * 2 + index)

    top_center_index = len(vertices)
    vertices.append(to_blender_location((0, y + 0.018, 0)))
    bottom_tip_index = len(vertices)
    vertices.append(to_blender_location((0, y - thickness * 1.08, 0)))

    faces: list[tuple[int, ...]] = []
    for index in range(segments):
        next_index = (index + 1) % segments
        faces.append((top_center_index, top_indices[index], top_indices[next_index]))
        faces.append((top_indices[index], waist_indices[index], waist_indices[next_index], top_indices[next_index]))
        faces.append((waist_indices[index], bottom_indices[index], bottom_indices[next_index], waist_indices[next_index]))
        faces.append((bottom_tip_index, bottom_indices[next_index], bottom_indices[index]))

    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return polish_mesh_object(obj, smooth=True, bevel=0.006)


def add_organic_island_top(
    name: str,
    material: bpy.types.Material,
    *,
    radius_x: float,
    radius_z: float,
    y: float,
    segments: int = 40,
) -> bpy.types.Object:
    """生成可见的岛面地貌盖板。

    只做暗色岩壳会让浮岛在首页截图里变成灰色块。目标图里每块浮岛顶部都有
    地貌、跑道和设施叠加，因此这里在岩壳上方补一层不规则地面 Mesh，作为
    后续站台、灯塔和航线锚点的承载面。
    """

    vertices = [to_blender_location((0, y, 0))]
    faces: list[tuple[int, int, int]] = []

    for index in range(segments):
        angle = (index / segments) * math.pi * 2
        terrain_noise = 0.92 + math.sin(index * 1.4) * 0.04 + math.cos(index * 0.6) * 0.035
        x = math.cos(angle) * radius_x * terrain_noise
        z = math.sin(angle) * radius_z * (0.9 + math.cos(index * 1.1) * 0.045)
        vertices.append(to_blender_location((x, y + math.sin(index * 0.8) * 0.012, z)))

    for index in range(1, segments + 1):
        faces.append((0, index, 1 if index == segments else index + 1))

    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return polish_mesh_object(obj, smooth=True, bevel=0.003)


def import_asset(
    asset_key: str,
    name: str,
    *,
    location: tuple[float, float, float],
    rotation: tuple[float, float, float] = (0, 0, 0),
    target_size: float = 1.0,
    material: bpy.types.Material | None = None,
    preserve_source_materials: bool = False,
) -> bpy.types.Object:
    """导入原始 GLB 并挂到统一 Empty 根节点。

    原始资产的原点、单位和父子层级并不一致；这里只移动顶层节点，避免子 Mesh
    被重复抵消中心点，导致导出后看起来像多个贴片错位。
    """

    filepath = SOURCE_DIR / ASSETS[asset_key]
    if not filepath.exists():
        raise FileNotFoundError(f"Missing source GLB: {filepath}")

    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(filepath))
    imported = [obj for obj in bpy.context.scene.objects if obj not in before]
    center, _size, max_dimension = get_bounds(imported)

    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    root.empty_display_type = "CUBE"
    root.empty_display_size = target_size * 0.2
    root.location = to_blender_location(location)
    root.rotation_euler = to_blender_rotation(rotation)
    root.scale = (target_size / max_dimension, target_size / max_dimension, target_size / max_dimension)

    imported_set = set(imported)
    for obj in [item for item in imported if item.parent not in imported_set]:
        obj.location -= center
        obj.parent = root

    for obj in imported:
        if obj.type == "MESH":
            obj.name = f"{name}_{obj.name}"
            if not preserve_source_materials:
                obj.data.materials.clear()
            if material and not preserve_source_materials:
                obj.data.materials.append(material)

    return root


def add_torus(
    name: str,
    material: bpy.types.Material,
    *,
    location: tuple[float, float, float],
    major_radius: float,
    minor_radius: float,
    rotation: tuple[float, float, float] = (0, 0, 0),
) -> bpy.types.Object:
    """添加实体灯环，保证即使不开运行时 Bloom 也能读出平台层级。"""

    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=144,
        minor_segments=10,
        location=to_blender_location(location),
        rotation=to_blender_rotation(rotation),
    )
    torus = bpy.context.object
    torus.name = name
    torus.data.materials.append(material)
    return polish_mesh_object(torus, smooth=True)


def add_cylinder(
    name: str,
    material: bpy.types.Material,
    *,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    vertices: int = 36,
) -> bpy.types.Object:
    """添加塔体、灯塔和航线插口，补足原始低模缺少的视觉锚点。"""

    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=to_blender_location(location))
    cylinder = bpy.context.object
    cylinder.name = name
    cylinder.data.materials.append(material)
    return polish_mesh_object(cylinder, smooth=vertices > 12, bevel=min(radius * 0.12, 0.006))


def add_box(
    name: str,
    material: bpy.types.Material,
    *,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    rotation: tuple[float, float, float] = (0, 0, 0),
) -> bpy.types.Object:
    """用低成本盒体补出远景连接桥和机械层，避免画面只有圆盘。"""

    bpy.ops.mesh.primitive_cube_add(size=1, location=to_blender_location(location), rotation=to_blender_rotation(rotation))
    box = bpy.context.object
    box.name = name
    box.scale = to_blender_scale(scale)
    box.data.materials.append(material)
    # 小窗口/灯条数量很多，如果每个都加倒角会让 GLB 节点和导出几何急剧膨胀，
    # 浏览器刷新会变慢；只有较大的实体模块才保留倒角质感。
    bevel = min(max(scale) * 0.02, 0.01) if max(scale) >= 0.055 else 0.0
    return polish_mesh_object(box, smooth=False, bevel=bevel)


def add_cone(
    name: str,
    material: bpy.types.Material,
    *,
    location: tuple[float, float, float],
    radius1: float,
    radius2: float,
    depth: float,
    vertices: int = 9,
    rotation: tuple[float, float, float] = (0, 0, 0),
) -> bpy.types.Object:
    """添加低多边形岩锥，用 Blender 几何补出目标图里的悬浮岛厚重岩底。

    原始 `Floating_Island_01_Art.glb` 在首页镜头里偏薄，单靠前端阴影会像一张贴片；
    这里把岩底作为派生模型的一部分导出，保证后续 Three.js 只负责光影，不再伪造体积。
    """

    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=to_blender_location(location),
        rotation=to_blender_rotation(rotation),
    )
    cone = bpy.context.object
    cone.name = name
    cone.data.materials.append(material)
    return polish_mesh_object(cone, smooth=vertices > 8)


def add_sphere(
    name: str,
    material: bpy.types.Material,
    *,
    location: tuple[float, float, float],
    radius: float,
) -> bpy.types.Object:
    """添加发光节点，前端 Bloom 会把这些节点扩成目标图里的灯点。"""

    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=radius, location=to_blender_location(location))
    sphere = bpy.context.object
    sphere.name = name
    sphere.data.materials.append(material)
    return polish_mesh_object(sphere, smooth=True)


def add_ellipsoid(
    name: str,
    material: bpy.types.Material,
    *,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    rotation: tuple[float, float, float] = (0, 0, 0),
) -> bpy.types.Object:
    """添加可读的椭球体外壳，用来补足源 GLB 在首页镜头中不够清晰的问题。"""

    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=48,
        ring_count=20,
        radius=1,
        location=to_blender_location(location),
        rotation=to_blender_rotation(rotation),
    )
    ellipsoid = bpy.context.object
    ellipsoid.name = name
    ellipsoid.scale = to_blender_scale(scale)
    ellipsoid.data.materials.append(material)
    return polish_mesh_object(ellipsoid, smooth=True)


def add_window_band(name: str, *, radius: float, y: float, material: bpy.types.Material, count: int = 36) -> None:
    """沿空间站外墙补短窗带，解决当前模型“只有大圆盘、缺少建筑密度”的问题。"""

    for index in range(count):
        angle = (index / count) * math.pi * 2
        # 每四个窗口留一个断点，形成目标图中分段舱室的节奏，而不是均匀发光实线。
        if index % 4 == 3:
            continue
        add_box(
            f"{name}_window_{index:02d}",
            material,
            location=(math.cos(angle) * radius, y, math.sin(angle) * radius),
            scale=(0.036, 0.012, 0.008),
            rotation=(0, -angle + math.pi / 2, 0),
        )


def add_circular_facade_panels(
    name: str,
    *,
    radius: float,
    base_y: float,
    material: bpy.types.Material,
    window_material: bpy.types.Material,
    rows: int = 3,
    count: int = 56,
) -> None:
    """给中央枢纽补连续舱室外墙和窗口矩阵。

    目标图的主站核心是“圆形城市枢纽”，侧面有很多窗口、舱段和暖色灯点；
    只放一个源 GLB 圆盘会显得像玩具模型。这里用分段盒体做出可追溯的导出几何，
    之后 Three.js 只负责 Bloom 和色彩，不负责虚构建筑密度。
    """

    for row in range(rows):
        row_y = base_y + row * 0.075
        for index in range(count):
            angle = (index / count) * math.pi * 2
            # 每一圈留出少量暗段，模拟真实舱段分隔，避免窗口变成一整条霓虹线。
            is_dark_panel = (index + row) % 5 in (0, 1)
            panel_material = material if is_dark_panel else window_material
            width = 0.043 if is_dark_panel else 0.028
            add_box(
                f"{name}_facade_r{row}_{index:02d}",
                panel_material,
                location=(math.cos(angle) * radius, row_y, math.sin(angle) * radius),
                scale=(width, 0.025 if is_dark_panel else 0.012, 0.009),
                rotation=(0, -angle + math.pi / 2, 0),
            )


def add_orbital_city_blocks(
    name: str,
    *,
    radius: float,
    y: float,
    material: bpy.types.Material,
    accent: bpy.types.Material,
    count: int = 28,
) -> None:
    """围绕主站上层补小型建筑群，让圆形枢纽更像目标图里的空间城市。

    这些块体不是前端装饰，而是导出到 GLB 的派生几何；后续如果效果不对，
    可以直接回 Blender 文件调整，而不会散落在 Three.js 场景代码里。
    """

    for index in range(count):
        angle = (index / count) * math.pi * 2 + 0.08
        block_height = 0.05 + (index % 4) * 0.018
        block_width = 0.035 + (index % 3) * 0.012
        block_depth = 0.05 + (index % 2) * 0.01
        x = math.cos(angle) * radius
        z = math.sin(angle) * radius
        add_box(
            f"{name}_city_block_{index:02d}",
            material,
            location=(x, y + block_height * 0.5, z),
            scale=(block_width, block_height, block_depth),
            rotation=(0, -angle + math.pi / 2, 0),
        )
        if index % 3 != 0:
            add_box(
                f"{name}_city_window_{index:02d}",
                accent,
                location=(math.cos(angle) * (radius + 0.012), y + block_height * 0.58, math.sin(angle) * (radius + 0.012)),
                scale=(block_width * 0.54, 0.006, 0.004),
                rotation=(0, -angle + math.pi / 2, 0),
            )


def add_floating_island_mass(
    name: str,
    *,
    radius: float,
    y: float,
    depth: float,
    shard_count: int = 11,
) -> None:
    """把浮岛从薄片补成有岩体厚度的可导出几何。

    目标图里的节点不是单个模型小盘子，而是带岩壁、岛面、平台和局部植物的浮空地块。
    这里用确定性角度生成一圈暗色岩锥，既保留 GLB 底模，又把远景轮廓加厚。
    """

    mats = materials()
    add_organic_island_shell(
        f"{name}_organic_rock_shell",
        mats["rock"],
        radius_x=radius * 1.16,
        radius_z=radius * 0.84,
        y=y,
        thickness=depth,
        segments=34,
    )
    add_organic_island_top(
        f"{name}_terrain_cap",
        mats["terrain"],
        radius_x=radius * 0.96,
        radius_z=radius * 0.68,
        y=y + 0.038,
        segments=36,
    )
    for index in range(shard_count):
        angle = (index / shard_count) * math.pi * 2
        stagger = 0.58 + (index % 3) * 0.08
        shard_radius = radius * (0.18 + (index % 4) * 0.03)
        add_cone(
            f"{name}_underside_shard_{index:02d}",
            mats["rock"],
            location=(math.cos(angle) * radius * 0.34, y - depth * (0.5 + (index % 2) * 0.08), math.sin(angle) * radius * 0.26),
            radius1=0.02 + (index % 2) * 0.016,
            radius2=shard_radius,
            depth=depth * stagger,
            vertices=7 + (index % 3),
            rotation=(0, angle * 0.18, 0),
        )


def add_hex_tile_field(name: str, *, radius: float, y: float, accent: bpy.types.Material, count: int = 10) -> None:
    """在岛面补一组小型六边形停机坪，让目标图中的地面纹理不只靠贴图。"""

    mats = materials()
    for index in range(count):
        angle = (index / count) * math.pi * 2
        ring = radius * (0.24 + (index % 3) * 0.16)
        tile_material = accent if index % 4 == 0 else mats["pad"]
        add_cylinder(
            f"{name}_hex_tile_{index:02d}",
            tile_material,
            location=(math.cos(angle) * ring, y + 0.012, math.sin(angle) * ring),
            radius=0.045 + (index % 2) * 0.014,
            depth=0.012,
            vertices=6,
        )


def add_station_spire_cluster(name: str, *, radius: float, y: float, accent: bpy.types.Material, count: int = 6) -> None:
    """补目标图里主站/节点周围密集的天线尖塔和顶部灯。"""

    mats = materials()
    for index in range(count):
        angle = (index / count) * math.pi * 2 + 0.14
        height = 0.28 + (index % 3) * 0.08
        x = math.cos(angle) * radius
        z = math.sin(angle) * radius
        add_cylinder(
            f"{name}_spire_mast_{index:02d}",
            mats["pad"],
            location=(x, y + height * 0.5, z),
            radius=0.012,
            depth=height,
            vertices=12,
        )
        add_sphere(
            f"{name}_spire_beacon_{index:02d}",
            accent,
            location=(x, y + height + 0.04, z),
            radius=0.018,
        )


def add_cinematic_bridge(
    name: str,
    *,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    material: bpy.types.Material,
    accent: bpy.types.Material,
) -> None:
    """补导出级连桥，目标图里平台之间有实体通道，不能只靠运行时光线表达。"""

    mid = ((start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5, (start[2] + end[2]) * 0.5)
    dx = end[0] - start[0]
    dz = end[2] - start[2]
    length = math.sqrt(dx * dx + dz * dz)
    angle = math.atan2(dz, dx)
    add_box(f"{name}_service_bridge_body", material, location=mid, scale=(length * 0.5, 0.018, 0.035), rotation=(0, -angle, 0))
    add_box(
        f"{name}_service_bridge_light",
        accent,
        location=(mid[0], mid[1] + 0.024, mid[2]),
        scale=(length * 0.46, 0.004, 0.006),
        rotation=(0, -angle, 0),
    )


def add_anchor(name: str, location: list[float] | tuple[float, float, float]) -> None:
    """添加可导出的命名 Empty，前端用它校验模型和交互锚点是否对齐。"""

    bpy.ops.object.empty_add(type="PLAIN_AXES", location=to_blender_location(location))
    anchor = bpy.context.object
    anchor.name = name
    anchor.empty_display_size = 0.12


def add_ring_lights(radius: float, y: float, material: bpy.types.Material, *, count: int = 16) -> None:
    """沿圆环补点状灯，模拟参考图里空间站外圈密集灯带。"""

    for index in range(count):
        angle = (index / count) * math.pi * 2
        add_sphere(
            f"AI_PM_ring_light_{index:02d}",
            material,
            location=(math.cos(angle) * radius, y, math.sin(angle) * radius),
            radius=0.018,
        )


def add_station_deck(
    name: str,
    *,
    radius: float,
    y: float,
    accent: bpy.types.Material,
    light_count: int = 18,
    thickness: float = 0.055,
) -> None:
    """补一层清晰的圆形站台，避免原始低模岛屿在首页里读成散乱碎片。"""

    mats = materials()
    add_cylinder(f"{name}_round_deck", mats["pad"], location=(0, y, 0), radius=radius, depth=thickness, vertices=96)
    add_torus(f"{name}_outer_light_ring", accent, location=(0, y + 0.04, 0), major_radius=radius * 0.88, minor_radius=0.0075)
    add_torus(f"{name}_inner_service_ring", mats["cyan"], location=(0, y + 0.075, 0), major_radius=radius * 0.5, minor_radius=0.005)
    add_ring_lights(radius * 0.78, y + 0.082, accent, count=light_count)


def add_radial_docks(name: str, material: bpy.types.Material, *, radius: float, y: float, count: int = 8) -> None:
    """给主空间站补径向泊位，让它更接近目标图的圆形交通枢纽。"""

    for index in range(count):
        angle = (index / count) * math.pi * 2
        length = 0.22 if index % 2 == 0 else 0.15
        x = math.cos(angle) * radius
        z = math.sin(angle) * radius
        add_box(
            f"{name}_dock_{index:02d}",
            material,
            location=(x, y, z),
            scale=(length, 0.018, 0.045),
            rotation=(0, -angle, 0),
        )


def add_perimeter_signal_towers(
    name: str,
    *,
    radius: float,
    y: float,
    accent: bpy.types.Material,
    count: int = 8,
) -> None:
    """补目标图里空间站外圈可见的小塔和灯点，增强主站建筑密度。"""

    mats = materials()
    for index in range(count):
        angle = (index / count) * math.pi * 2 + math.pi / count
        x = math.cos(angle) * radius
        z = math.sin(angle) * radius
        add_cylinder(
            f"{name}_signal_tower_{index:02d}",
            mats["pad"],
            location=(x, y + 0.08, z),
            radius=0.018,
            depth=0.25 if index % 2 else 0.32,
            vertices=18,
        )
        add_sphere(
            f"{name}_signal_light_{index:02d}",
            accent,
            location=(x, y + (0.24 if index % 2 else 0.3), z),
            radius=0.022,
        )


def add_terrain_patch(name: str, *, size: float, y: float, rotation: float = 0.0) -> None:
    """复用原始 Terrain/Tree GLB 做岛面，避免派生岛只剩黑色岩体。"""

    mats = materials()
    import_asset(
        "terrain",
        f"{name}_terrain_surface",
        location=(0, y, 0),
        rotation=(0, rotation, 0),
        target_size=size,
        material=mats["terrain"],
    )


def add_tree_cluster(name: str, *, y: float, radius: float, count: int = 5) -> None:
    """给近景浮岛补小比例树群，接近目标图中岛面暗绿细节。"""

    mats = materials()
    for index in range(count):
        angle = (index / count) * math.pi * 2 + (index % 2) * 0.22
        import_asset(
            "tree",
            f"{name}_tree_{index:02d}",
            location=(math.cos(angle) * radius, y, math.sin(angle) * radius),
            rotation=(0, -angle, 0),
            target_size=0.11 if index % 2 == 0 else 0.085,
            material=mats["foliage"],
        )


def build_central_command_station() -> None:
    mats = materials()
    import_asset("island", "AI_PM_core_island", location=(0, -0.64, 0.03), rotation=(0, 0.18, 0), target_size=0.72, material=mats["rock"])
    add_organic_island_shell(
        "AI_PM_core_city_rock_shell",
        mats["rock"],
        radius_x=1.18,
        radius_z=0.72,
        y=-0.38,
        thickness=0.72,
        segments=42,
    )
    add_organic_island_top(
        "AI_PM_core_city_terrain_cap",
        mats["terrain"],
        radius_x=1.02,
        radius_z=0.58,
        y=-0.3,
        segments=48,
    )
    # 主站保留岩底体量，但避免重新生成一整面黑墙；核心视觉应来自圆形站体和灯环。
    add_cone(
        "AI_PM_core_compact_underbody",
        mats["rock"],
        location=(0, -0.78, 0.02),
        radius1=0.1,
        radius2=0.36,
        depth=0.42,
        vertices=11,
    )
    import_asset("station_main", "AI_PM_core_station", location=(0, -0.01, 0), rotation=(0, -0.16, 0), target_size=1.88, preserve_source_materials=True)
    import_asset("station_pink", "AI_PM_core_magenta_ring_asset", location=(0, 0.12, 0), rotation=(0, 0.08, 0), target_size=2.04, preserve_source_materials=True)
    add_station_deck("AI_PM_core_primary", radius=1.02, y=-0.06, accent=mats["magenta"], light_count=56, thickness=0.12)
    add_cylinder("AI_PM_core_lower_habitat_band", mats["pad"], location=(0, -0.08, 0), radius=0.82, depth=0.19, vertices=144)
    add_cylinder("AI_PM_core_mid_habitat_band", mats["pad"], location=(0, 0.12, 0), radius=0.68, depth=0.15, vertices=128)
    add_cylinder("AI_PM_core_upper_habitat_band", mats["pad"], location=(0, 0.32, 0), radius=0.54, depth=0.11, vertices=112)
    add_cylinder("AI_PM_core_observation_deck", mats["pad"], location=(0, 0.49, 0), radius=0.38, depth=0.07, vertices=96)
    add_circular_facade_panels("AI_PM_core_lower_city", radius=0.85, base_y=-0.12, material=mats["pad"], window_material=mats["cyan"], rows=2, count=44)
    add_circular_facade_panels("AI_PM_core_mid_city", radius=0.7, base_y=0.11, material=mats["pad"], window_material=mats["orange"], rows=2, count=36)
    add_window_band("AI_PM_core_lower", radius=0.88, y=-0.2, material=mats["cyan"], count=48)
    add_window_band("AI_PM_core_mid", radius=0.72, y=0.06, material=mats["orange"], count=40)
    add_window_band("AI_PM_core_upper", radius=0.56, y=0.28, material=mats["blue"], count=32)
    add_torus("AI_PM_core_outer_magenta_runway", mats["magenta"], location=(0, 0.1, 0), major_radius=1.02, minor_radius=0.018)
    add_torus("AI_PM_core_outer_dark_guardrail", mats["pad"], location=(0, 0.16, 0), major_radius=1.08, minor_radius=0.006)
    add_torus("AI_PM_core_mid_blue_runway", mats["blue"], location=(0, 0.34, 0), major_radius=0.66, minor_radius=0.01)
    add_torus("AI_PM_core_inner_cyan_runway", mats["cyan"], location=(0, 0.46, 0), major_radius=0.34, minor_radius=0.007)
    add_orbital_city_blocks("AI_PM_core_lower", radius=0.98, y=0.08, material=mats["pad"], accent=mats["cyan"], count=24)
    add_orbital_city_blocks("AI_PM_core_upper", radius=0.58, y=0.44, material=mats["pad"], accent=mats["orange"], count=16)
    add_radial_docks("AI_PM_core", mats["pad"], radius=1.08, y=-0.04, count=18)
    add_station_spire_cluster("AI_PM_core_outer", radius=0.96, y=0.12, accent=mats["magenta"], count=12)
    add_perimeter_signal_towers("AI_PM_core", radius=0.9, y=0.18, accent=mats["magenta"], count=16)
    add_cylinder("AI_PM_core_command_tower", mats["pad"], location=(0, 0.9, 0), radius=0.084, depth=0.78, vertices=64)
    add_cylinder("AI_PM_core_tower_light_column", mats["cyan"], location=(0, 1.0, 0), radius=0.022, depth=0.72, vertices=32)
    add_torus("AI_PM_core_tower_signal_ring", mats["magenta"], location=(0, 1.3, 0), major_radius=0.2, minor_radius=0.008)
    add_torus("AI_PM_core_tower_blue_ring", mats["blue"], location=(0, 1.08, 0), major_radius=0.14, minor_radius=0.006)
    add_sphere("AI_PM_core_top_beacon", mats["cyan"], location=(0, 1.42, 0), radius=0.042)
    add_anchor("socket.route.in", [-0.52, 0.18, 0.42])
    add_anchor("socket.route.out", [0.52, 0.2, 0.42])
    add_anchor("socket.cameraFocus", [0, 0.3, 0])
    add_anchor("socket.lightKey", [0, 1.3, 0])


def build_requirements_tower_island() -> None:
    mats = materials()
    import_asset("island", "AI_PM_requirements_island", location=(0, -0.62, 0), rotation=(0, -0.45, 0), target_size=0.7, material=mats["rock"])
    add_floating_island_mass("AI_PM_requirements", radius=0.42, y=-0.45, depth=0.42, shard_count=10)
    add_terrain_patch("AI_PM_requirements", size=0.58, y=-0.25, rotation=0.18)
    add_tree_cluster("AI_PM_requirements", y=-0.1, radius=0.22, count=4)
    import_asset("ground_hexes_a", "AI_PM_requirements_hex_pad", location=(0, -0.2, 0), rotation=(0, 0.2, 0), target_size=0.48, preserve_source_materials=True)
    add_hex_tile_field("AI_PM_requirements", radius=0.36, y=-0.1, accent=mats["cyan"], count=9)
    add_station_deck("AI_PM_requirements", radius=0.39, y=-0.02, accent=mats["cyan"], light_count=18, thickness=0.055)
    import_asset("station_mini", "AI_PM_requirements_tower", location=(0, 0.12, 0), rotation=(0, -0.15, 0), target_size=0.38, preserve_source_materials=True)
    import_asset("lamp", "AI_PM_requirements_signal_lamp", location=(0.18, 0.08, -0.12), rotation=(0, 0.2, 0), target_size=0.22, preserve_source_materials=True)
    add_station_spire_cluster("AI_PM_requirements", radius=0.34, y=0.04, accent=mats["cyan"], count=5)
    add_cylinder("AI_PM_requirements_beam", mats["cyan"], location=(0, 0.2, 0), radius=0.018, depth=0.32, vertices=20)
    add_sphere("AI_PM_requirements_beacon", mats["cyan"], location=(0, 0.36, 0), radius=0.034)
    add_anchor("socket.route.in", [-0.08, 0.08, -0.1])
    add_anchor("socket.route.out", [0.36, 0.08, 0.36])
    add_anchor("socket.card", [-0.08, 0.78, -0.02])
    add_anchor("socket.cameraFocus", [0, 0.08, 0])
    add_anchor("socket.lightKey", [0, 0.34, 0])


def build_version_harbor_island() -> None:
    mats = materials()
    import_asset("island", "AI_PM_versions_island", location=(0, -0.6, 0), rotation=(0, 0.38, 0), target_size=0.88, material=mats["rock"])
    add_floating_island_mass("AI_PM_versions", radius=0.56, y=-0.46, depth=0.5, shard_count=12)
    add_terrain_patch("AI_PM_versions", size=0.7, y=-0.28, rotation=-0.2)
    add_tree_cluster("AI_PM_versions", y=-0.12, radius=0.33, count=7)
    import_asset("station_ring", "AI_PM_versions_station_ring", location=(0, -0.18, 0), rotation=(0, -0.2, 0), target_size=0.64, preserve_source_materials=True)
    import_asset("ground_hexes_b", "AI_PM_versions_hex_field", location=(-0.04, -0.28, 0.08), rotation=(0, 0.22, 0), target_size=0.42, preserve_source_materials=True)
    add_hex_tile_field("AI_PM_versions", radius=0.48, y=-0.1, accent=mats["blue"], count=12)
    add_station_deck("AI_PM_versions", radius=0.5, y=-0.04, accent=mats["blue"], light_count=20, thickness=0.065)
    add_cylinder("AI_PM_versions_control_tower", mats["pad"], location=(0.18, 0.14, -0.12), radius=0.034, depth=0.32, vertices=24)
    add_station_spire_cluster("AI_PM_versions", radius=0.42, y=0.02, accent=mats["blue"], count=6)
    add_sphere("AI_PM_versions_beacon", mats["blue"], location=(0.18, 0.34, -0.12), radius=0.036)
    add_anchor("socket.route.in", [-0.42, 0.02, -0.12])
    add_anchor("socket.route.out", [0.5, 0.04, -0.04])
    add_anchor("socket.card", [0.05, 0.72, 0.08])
    add_anchor("socket.cameraFocus", [0, -0.02, 0])
    add_anchor("socket.lightKey", [0, 0.28, 0])


def build_bug_repair_dock() -> None:
    mats = materials()
    import_asset("island", "AI_PM_bug_island", location=(0, -0.58, 0), rotation=(0, -0.22, 0), target_size=0.86, material=mats["rock"])
    add_floating_island_mass("AI_PM_bug", radius=0.54, y=-0.45, depth=0.52, shard_count=12)
    add_terrain_patch("AI_PM_bug", size=0.66, y=-0.28, rotation=0.28)
    add_tree_cluster("AI_PM_bug", y=-0.12, radius=0.3, count=6)
    import_asset("door", "AI_PM_bug_dock_door", location=(-0.03, -0.16, 0), rotation=(0, -0.36, 0), target_size=0.44, preserve_source_materials=True)
    import_asset("lamp", "AI_PM_bug_repair_beacon", location=(0.25, -0.1, -0.2), rotation=(0, 0.12, 0), target_size=0.26, preserve_source_materials=True)
    add_hex_tile_field("AI_PM_bug", radius=0.46, y=-0.11, accent=mats["orange"], count=10)
    add_station_deck("AI_PM_bug", radius=0.48, y=-0.08, accent=mats["orange"], light_count=18, thickness=0.065)
    add_box("AI_PM_bug_service_bridge", mats["pad"], location=(-0.32, -0.08, 0.18), scale=(0.34, 0.022, 0.065), rotation=(0, -0.35, 0))
    add_station_spire_cluster("AI_PM_bug", radius=0.42, y=0.02, accent=mats["orange"], count=6)
    add_sphere("AI_PM_bug_hot_beacon", mats["orange"], location=(0.2, 0.24, -0.12), radius=0.038)
    add_anchor("socket.route.in", [-0.38, 0.02, -0.04])
    add_anchor("socket.route.out", [0.42, 0.06, -0.12])
    add_anchor("socket.card", [0.04, 0.68, 0.08])
    add_anchor("socket.cameraFocus", [0, -0.04, 0])
    add_anchor("socket.lightKey", [0.2, 0.23, -0.12])


def build_launch_gate_island() -> None:
    mats = materials()
    import_asset("island", "AI_PM_launch_island", location=(0, -0.58, 0), rotation=(0, -0.12, 0), target_size=0.9, material=mats["rock"])
    add_floating_island_mass("AI_PM_launch", radius=0.58, y=-0.44, depth=0.55, shard_count=13)
    add_terrain_patch("AI_PM_launch", size=0.7, y=-0.27, rotation=-0.1)
    add_tree_cluster("AI_PM_launch", y=-0.1, radius=0.31, count=6)
    import_asset("station_yellow", "AI_PM_launch_station", location=(0, -0.18, 0), rotation=(0, 0.5, 0), target_size=0.56, preserve_source_materials=True)
    import_asset("ground_hex", "AI_PM_launch_pad", location=(0.02, -0.28, 0), rotation=(0, 0.15, 0), target_size=0.44, preserve_source_materials=True)
    add_hex_tile_field("AI_PM_launch", radius=0.5, y=-0.1, accent=mats["orange"], count=11)
    add_station_deck("AI_PM_launch", radius=0.52, y=-0.06, accent=mats["orange"], light_count=22, thickness=0.065)
    add_cylinder("AI_PM_launch_gate_column_a", mats["pad"], location=(-0.16, 0.16, 0.02), radius=0.026, depth=0.36, vertices=24)
    add_cylinder("AI_PM_launch_gate_column_b", mats["pad"], location=(0.16, 0.16, 0.02), radius=0.026, depth=0.36, vertices=24)
    add_torus("AI_PM_launch_gate_top_ring", mats["orange"], location=(0, 0.28, 0.02), major_radius=0.18, minor_radius=0.006)
    add_station_spire_cluster("AI_PM_launch", radius=0.44, y=0.02, accent=mats["orange"], count=7)
    add_sphere("AI_PM_launch_gate_beacon", mats["orange"], location=(0, 0.36, 0.02), radius=0.036)
    add_anchor("socket.route.in", [-0.48, 0.08, 0.1])
    add_anchor("socket.route.out", [0.12, 0.2, 0.08])
    add_anchor("socket.card", [-0.08, 0.8, 0.1])
    add_anchor("socket.cameraFocus", [0, 0.02, 0])
    add_anchor("socket.lightKey", [0, 0.44, 0.02])


def build_background_support_stations() -> None:
    mats = materials()
    import_asset("island", "AI_PM_background_left_island", location=(-0.9, -0.42, 0), rotation=(0, 0.64, 0), target_size=0.76, material=mats["rock"])
    add_floating_island_mass("AI_PM_background_left", radius=0.42, y=-0.34, depth=0.42, shard_count=8)
    import_asset("station_ring", "AI_PM_background_left_station", location=(-0.9, -0.1, 0), rotation=(0, 0.72, 0), target_size=0.5, preserve_source_materials=True)
    add_station_deck("AI_PM_background_left", radius=0.34, y=-0.04, accent=mats["blue"], light_count=12, thickness=0.04)
    import_asset("island", "AI_PM_background_right_island", location=(0.85, -0.38, 0.12), rotation=(0, -0.42, 0), target_size=0.88, material=mats["rock"])
    add_floating_island_mass("AI_PM_background_right", radius=0.48, y=-0.31, depth=0.46, shard_count=9)
    import_asset("station_mini", "AI_PM_background_right_station", location=(0.85, -0.04, 0.12), rotation=(0, -0.35, 0), target_size=0.46, preserve_source_materials=True)
    add_station_deck("AI_PM_background_right", radius=0.36, y=-0.02, accent=mats["magenta"], light_count=12, thickness=0.04)
    add_cinematic_bridge(
        "AI_PM_background",
        start=(-0.62, -0.12, 0.02),
        end=(0.52, -0.1, 0.1),
        material=mats["pad"],
        accent=mats["magenta"],
    )
    add_sphere("AI_PM_background_cyan_beacon", mats["cyan"], location=(-0.85, 0.18, 0), radius=0.03)
    add_sphere("AI_PM_background_magenta_beacon", mats["magenta"], location=(0.78, 0.18, 0.12), radius=0.028)
    add_anchor("socket.cameraFocus", [0, -0.02, 0.04])
    add_anchor("socket.lightKey", [0, 0.2, 0.04])


def build_airship_cruiser() -> None:
    mats = materials()
    import_asset("airship", "AI_PM_airship_cruiser_body", location=(0, 0, 0), rotation=(0, -math.pi / 2, 0), target_size=1.0, preserve_source_materials=True)
    # 目标图里的飞艇是清楚的银色胶囊，不只是一个发光点；这里基于源 GLB 叠加可导出的
    # 外壳/窗带/尾翼，让运行时缩放后仍能读出“飞船遨游”的主体。
    add_ellipsoid("AI_PM_airship_visible_silver_hull", mats["airship"], location=(0.02, 0.02, 0), scale=(0.52, 0.16, 0.16), rotation=(0, 0.02, 0))
    add_ellipsoid("AI_PM_airship_blue_nose_cap", mats["cyan"], location=(0.48, 0.02, 0), scale=(0.06, 0.07, 0.07))
    add_box("AI_PM_airship_upper_fin", mats["pad"], location=(-0.28, 0.17, 0), scale=(0.09, 0.025, 0.12), rotation=(0, 0, 0.18))
    add_box("AI_PM_airship_lower_fin", mats["pad"], location=(-0.28, -0.11, 0), scale=(0.09, 0.025, 0.12), rotation=(0, 0, -0.18))
    add_sphere("AI_PM_airship_front_light", mats["cyan"], location=(0.54, 0.02, 0), radius=0.026)
    add_sphere("AI_PM_airship_rear_thruster", mats["orange"], location=(-0.55, -0.02, 0), radius=0.038)
    add_box("AI_PM_airship_window_strip", mats["cyan"], location=(0.03, 0.08, -0.03), scale=(0.34, 0.01, 0.01), rotation=(0, 0.02, 0))
    add_anchor("socket.nose", [0.48, 0.02, 0])
    add_anchor("socket.thruster", [-0.56, -0.02, 0])
    add_anchor("socket.cameraFollow", [0.02, 0.18, 0.24])
    add_anchor("socket.lightKey", [0.42, 0.02, 0])


def build_route_beacon_kit() -> None:
    mats = materials()
    route_index = 0
    for route_id, route in ROUTES.items():
        material = mats["blue"] if route_id == "blue" else mats["orange"]
        for point in route["points"]:
            add_cylinder(
                f"AI_PM_route_{route_id}_pylon_{route_index:02d}",
                mats["pad"],
                location=(point[0], point[1] - 0.12, point[2]),
                radius=0.018,
                depth=0.24,
                vertices=18,
            )
            add_sphere(
                f"AI_PM_route_{route_id}_beacon_{route_index:02d}",
                material,
                location=(point[0], point[1], point[2]),
                radius=0.034,
            )
            add_anchor(f"socket.route.{route_id}.{route_index}", point)
            route_index += 1

    for card in CARDS:
        add_anchor(f"socket.card.{card['id']}", card["position"])

    add_anchor("socket.cameraFocus", [0.68, 0.08, 0.42])
    add_anchor("socket.lightKey", [0.68, 0.48, 0.42])


def derived_specs() -> list[DerivedModelSpec]:
    """声明派生模型包，顺序同时决定前端加载和视觉层级。"""

    return [
        {
            "id": "background-support-stations",
            "title": "远景支撑空间站",
            "role": "background-depth",
            "placement": {"position": [1.12, -0.28, -1.42], "rotation": [0, 0, 0], "scale": [0.98, 0.98, 0.98]},
            "sourceKeys": ["island", "station_ring", "station_mini"],
            "builder": build_background_support_stations,
            "anchors": {"socket.cameraFocus": [1.12, -0.24, -1.26], "socket.lightKey": [1.12, 0.08, -1.26]},
        },
        {
            "id": "central-command-station",
            "title": "中央主空间站",
            "role": "hero-station",
            "placement": {"position": [0.98, 0.02, -0.16], "rotation": [0, 0, 0], "scale": [1.12, 0.84, 1.12]},
            "sourceKeys": ["island", "station_main", "station_pink"],
            "builder": build_central_command_station,
            "anchors": {"socket.cameraFocus": [0.98, 0.28, -0.16], "socket.lightKey": [0.98, 1.14, -0.16]},
        },
        {
            "id": "requirements-tower-island",
            "title": "需求塔台岛",
            "role": "chapter-node",
            "placement": {"position": [-0.82, -0.08, -0.2], "rotation": [0, 0, 0], "scale": [1.04, 1.04, 1.04]},
            "sourceKeys": ["island", "terrain", "tree", "ground_hexes_a", "station_mini", "lamp"],
            "builder": build_requirements_tower_island,
            "anchors": {"socket.card": [-0.82, 0.62, -0.18], "socket.cameraFocus": [-0.82, -0.1, -0.18]},
        },
        {
            "id": "version-harbor-island",
            "title": "版本航站岛",
            "role": "chapter-node",
            "placement": {"position": [-0.18, -0.5, 1.04], "rotation": [0, 0, 0], "scale": [1.08, 1.08, 1.08]},
            "sourceKeys": ["island", "terrain", "tree", "station_ring", "ground_hexes_b"],
            "builder": build_version_harbor_island,
            "anchors": {"socket.card": [-0.18, 0.12, 1.08], "socket.cameraFocus": [-0.18, -0.52, 1.04]},
        },
        {
            "id": "bug-repair-dock",
            "title": "Bug 维修坞",
            "role": "chapter-node",
            "placement": {"position": [1.44, -0.46, 1.08], "rotation": [0, 0, 0], "scale": [1.08, 1.08, 1.08]},
            "sourceKeys": ["island", "terrain", "tree", "door", "lamp"],
            "builder": build_bug_repair_dock,
            "anchors": {"socket.card": [1.44, 0.12, 1.08], "socket.cameraFocus": [1.44, -0.52, 1.08]},
        },
        {
            "id": "launch-gate-island",
            "title": "上线闸口岛",
            "role": "chapter-node",
            "placement": {"position": [2.26, -0.1, 0.08], "rotation": [0, 0, 0], "scale": [1.08, 1.08, 1.08]},
            "sourceKeys": ["island", "terrain", "tree", "station_yellow", "ground_hex"],
            "builder": build_launch_gate_island,
            "anchors": {"socket.card": [2.24, 0.6, 0.14], "socket.cameraFocus": [2.26, -0.18, 0.08]},
        },
        {
            "id": "route-beacon-kit",
            "title": "航线灯塔与锚点套件",
            "role": "runtime-route-sockets",
            "placement": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
            "sourceKeys": [],
            "builder": build_route_beacon_kit,
            "anchors": {"socket.cameraFocus": [0.68, 0.08, 0.42], "socket.lightKey": [0.68, 0.48, 0.42]},
        },
        {
            "id": "airship-cruiser",
            "title": "可飞行飞艇",
            "role": "flight-vehicle",
            "placement": {"position": [1.64, 0.42, 0.58], "rotation": [0, 0, 0], "scale": [0.72, 0.72, 0.72]},
            "sourceKeys": ["airship"],
            "builder": build_airship_cruiser,
            "anchors": {"socket.nose": [0.48, 0.02, 0], "socket.thruster": [-0.56, -0.02, 0]},
        },
    ]


def configure_preview_camera() -> None:
    """给每个派生包生成预览图，便于不用打开 Blender 也能快速定位资产。"""

    bpy.ops.object.light_add(type="AREA", location=(1.8, 3.0, 3.2))
    light = bpy.context.object
    light.name = "AI_PM_preview_key_light"
    light.data.energy = 420
    light.data.size = 4

    bpy.ops.object.camera_add(location=(2.0, 1.35, 3.0), rotation=(math.radians(64), 0, math.radians(34)))
    camera = bpy.context.object
    bpy.context.scene.camera = camera
    camera.name = "AI_PM_preview_camera"
    camera.data.lens = 34
    camera.data.dof.use_dof = True
    camera.data.dof.focus_distance = 3.0
    camera.data.dof.aperture_fstop = 5.6

    bpy.context.scene.render.resolution_x = 720
    bpy.context.scene.render.resolution_y = 480
    bpy.context.scene.eevee.taa_render_samples = 32


def write_model_files(spec: DerivedModelSpec) -> dict:
    """导出单个派生模型包并写入模型级 manifest。"""

    model_dir = DERIVED_DIR / spec["id"]
    blend_dir = BLENDER_DERIVED_DIR / spec["id"]
    model_dir.mkdir(parents=True, exist_ok=True)
    blend_dir.mkdir(parents=True, exist_ok=True)

    glb_path = model_dir / "model.glb"
    preview_path = model_dir / "preview.png"
    blend_path = blend_dir / f"{spec['id']}.blend"
    relative_glb = f"/aero-system/models/derived/{spec['id']}/model.glb"
    relative_preview = f"/aero-system/models/derived/{spec['id']}/preview.png"

    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        use_selection=False,
    )

    configure_preview_camera()
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.context.scene.render.filepath = str(preview_path)
    bpy.ops.render.render(write_still=True)

    manifest = {
        "id": spec["id"],
        "title": spec["title"],
        "role": spec["role"],
        "glb": relative_glb,
        "preview": relative_preview,
        "blenderFile": str(blend_path.relative_to(REPO_ROOT)),
        "sourceFiles": [ASSETS[key] for key in spec["sourceKeys"]],
        "placement": spec["placement"],
        "anchors": spec["anchors"],
    }
    (model_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (model_dir / "README.md").write_text(
        "\n".join(
            [
                f"# {spec['title']}",
                "",
                "该目录由 `pnpm aero:models` 基于 Blender 派生生成。",
                "如果浏览器效果和目标图偏差明显，应先回到对应 `.blend` 调整模型、材质或锚点，再重新导出。",
                "",
                f"- 模型角色：`{spec['role']}`",
                f"- 运行时模型：`{relative_glb}`",
                f"- Blender 文件：`{manifest['blenderFile']}`",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    return manifest


def write_scene_manifest(model_manifests: list[dict]) -> None:
    """写入前端唯一读取的场景 manifest，避免 Three.js 中散落硬编码模型路径。"""

    scene_manifest = {
        "generatedBy": "scripts/aero-system/derive-aero-scene.py",
        "sourceDirectory": "/aero-system/models/source",
        "derivedDirectory": "/aero-system/models/derived",
        "models": model_manifests,
        "cards": CARDS,
        "routes": ROUTES,
        "flightPath": FLIGHT_PATH,
        "cameraKeyframes": [
            {"progress": 0.0, "position": [0.16, 1.62, 6.65], "target": [0.94, -0.08, 0.4]},
            {"progress": 0.28, "position": [-0.08, 1.44, 6.24], "target": [-0.38, -0.14, 0.54]},
            {"progress": 0.55, "position": [0.7, 1.42, 6.14], "target": [0.9, -0.14, 0.64]},
            {"progress": 0.78, "position": [1.3, 1.44, 6.0], "target": [1.42, -0.14, 0.74]},
            {"progress": 1.0, "position": [1.58, 1.52, 6.12], "target": [1.72, -0.04, 0.18]},
        ],
    }
    SCENE_MANIFEST_PATH.write_text(json.dumps(scene_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    legacy_manifest = {
        "generatedBy": "scripts/aero-system/derive-aero-scene.py",
        "sceneManifest": "/aero-system/models/aero-flight-scene.manifest.json",
        "note": "旧的 processed 单体模型方案已迁移到 derived 分体模型包。",
    }
    (MODEL_ROOT / "aero-scene.manifest.json").write_text(json.dumps(legacy_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    """生成全部派生模型、预览图、Blender 工作文件和场景清单。"""

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    BLENDER_DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    model_manifests: list[dict] = []

    for spec in derived_specs():
        reset_scene()
        spec["builder"]()
        model_manifests.append(write_model_files(spec))

    write_scene_manifest(model_manifests)
    print(f"Generated {len(model_manifests)} derived Aero model packages.")


if __name__ == "__main__":
    main()
