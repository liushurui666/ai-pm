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
        "position": [-1.58, 0.72, -0.18],
        "status": "进行中",
        "summary": "收集需求，拆解任务",
        "title": "需求塔台",
    },
    {
        "accent": "#48a8ff",
        "id": "versions",
        "index": "02",
        "metric": "进行中 v1.2.3",
        "position": [-0.42, 0.16, 1.04],
        "status": "进行中",
        "summary": "规划版本，分配资源",
        "title": "版本航站",
    },
    {
        "accent": "#ffbb55",
        "id": "bugs",
        "index": "03",
        "metric": "进行中 5 个待处理",
        "position": [1.36, 0.08, 1.26],
        "status": "进行中",
        "summary": "发现问题，修复验证",
        "title": "Bug 维修坞",
    },
    {
        "accent": "#57e2a2",
        "id": "launch",
        "index": "04",
        "metric": "准备就绪 v1.2.3",
        "position": [2.36, 0.7, 0.18],
        "status": "准备就绪",
        "summary": "验收合规，发布上线",
        "title": "上线闸口",
    },
]


ROUTES = {
    "blue": {
        "color": "#4bd8ff",
        "points": [
            [-1.34, 0.06, -0.08],
            [-1.02, -0.08, 0.36],
            [-0.42, -0.16, 1.04],
            [0.34, 0.02, 0.62],
            [0.78, 0.22, -0.08],
        ],
    },
    "orange": {
        "color": "#ffc35c",
        "points": [
            [0.78, 0.22, -0.08],
            [1.08, -0.02, 0.74],
            [1.36, -0.12, 1.26],
            [1.9, 0.08, 0.78],
            [2.36, 0.22, 0.18],
        ],
    },
}


FLIGHT_PATH = [
    [-1.28, 0.22, -0.1],
    [-0.64, 0.16, 0.72],
    [0.38, 0.36, 0.48],
    [1.34, 0.24, 1.14],
    [2.18, 0.4, 0.28],
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
        "rock": ensure_material("AI_PM_dark_floating_rock", (0.025, 0.04, 0.055, 1), metallic=0.08, roughness=0.84),
        "pad": ensure_material(
            "AI_PM_station_dark_metal",
            (0.05, 0.078, 0.108, 1),
            emission=(0.0, 0.06, 0.1, 1),
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


def import_asset(
    asset_key: str,
    name: str,
    *,
    location: tuple[float, float, float],
    rotation: tuple[float, float, float] = (0, 0, 0),
    target_size: float = 1.0,
    material: bpy.types.Material | None = None,
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
    root.location = location
    root.rotation_euler = rotation
    root.scale = (target_size / max_dimension, target_size / max_dimension, target_size / max_dimension)

    imported_set = set(imported)
    for obj in [item for item in imported if item.parent not in imported_set]:
        obj.location -= center
        obj.parent = root

    for obj in imported:
        if obj.type == "MESH":
            obj.name = f"{name}_{obj.name}"
            obj.data.materials.clear()
            if material:
                obj.data.materials.append(material)

    return root


def add_torus(
    name: str,
    material: bpy.types.Material,
    *,
    location: tuple[float, float, float],
    major_radius: float,
    minor_radius: float,
    rotation: tuple[float, float, float] = (math.pi / 2, 0, 0),
) -> bpy.types.Object:
    """添加实体灯环，保证即使不开运行时 Bloom 也能读出平台层级。"""

    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=144,
        minor_segments=10,
        location=location,
        rotation=rotation,
    )
    torus = bpy.context.object
    torus.name = name
    torus.data.materials.append(material)
    return torus


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

    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    cylinder = bpy.context.object
    cylinder.name = name
    cylinder.data.materials.append(material)
    return cylinder


def add_box(
    name: str,
    material: bpy.types.Material,
    *,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    rotation: tuple[float, float, float] = (0, 0, 0),
) -> bpy.types.Object:
    """用低成本盒体补出远景连接桥和机械层，避免画面只有圆盘。"""

    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    box = bpy.context.object
    box.name = name
    box.scale = scale
    box.data.materials.append(material)
    return box


def add_sphere(
    name: str,
    material: bpy.types.Material,
    *,
    location: tuple[float, float, float],
    radius: float,
) -> bpy.types.Object:
    """添加发光节点，前端 Bloom 会把这些节点扩成目标图里的灯点。"""

    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=radius, location=location)
    sphere = bpy.context.object
    sphere.name = name
    sphere.data.materials.append(material)
    return sphere


def add_anchor(name: str, location: list[float] | tuple[float, float, float]) -> None:
    """添加可导出的命名 Empty，前端用它校验模型和交互锚点是否对齐。"""

    bpy.ops.object.empty_add(type="PLAIN_AXES", location=location)
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


def build_central_command_station() -> None:
    mats = materials()
    import_asset("island", "AI_PM_core_island", location=(0, -0.68, 0), rotation=(0, 0.22, 0), target_size=1.26, material=mats["rock"])
    import_asset("station_main", "AI_PM_core_station", location=(0, 0.04, 0), rotation=(0, -0.16, 0), target_size=1.52, material=mats["pad"])
    import_asset("station_pink", "AI_PM_core_magenta_ring_asset", location=(0, 0.18, 0), rotation=(0, 0.08, 0), target_size=1.66, material=mats["pad"])
    add_torus("AI_PM_core_outer_magenta_runway", mats["magenta"], location=(0, 0.24, 0), major_radius=0.82, minor_radius=0.015)
    add_torus("AI_PM_core_mid_blue_runway", mats["blue"], location=(0, 0.3, 0), major_radius=0.58, minor_radius=0.01)
    add_torus("AI_PM_core_inner_cyan_runway", mats["cyan"], location=(0, 0.38, 0), major_radius=0.36, minor_radius=0.009)
    add_cylinder("AI_PM_core_command_tower", mats["pad"], location=(0, 0.72, 0), radius=0.08, depth=0.78, vertices=44)
    add_torus("AI_PM_core_tower_signal_ring", mats["magenta"], location=(0, 1.1, 0), major_radius=0.18, minor_radius=0.008)
    add_sphere("AI_PM_core_top_beacon", mats["cyan"], location=(0, 1.22, 0), radius=0.052)
    add_ring_lights(0.78, 0.32, mats["cyan"], count=18)
    add_anchor("socket.route.in", [-0.5, 0.24, 0.48])
    add_anchor("socket.route.out", [0.52, 0.22, 0.5])
    add_anchor("socket.cameraFocus", [0, 0.34, 0])
    add_anchor("socket.lightKey", [0, 1.22, 0])


def build_requirements_tower_island() -> None:
    mats = materials()
    import_asset("island", "AI_PM_requirements_island", location=(0, -0.42, 0), rotation=(0, -0.45, 0), target_size=0.96, material=mats["rock"])
    import_asset("ground_hexes_a", "AI_PM_requirements_hex_pad", location=(0, -0.14, 0), rotation=(0, 0.2, 0), target_size=0.66, material=mats["pad"])
    import_asset("station_mini", "AI_PM_requirements_tower", location=(0, 0.05, 0), rotation=(0, -0.15, 0), target_size=0.46, material=mats["pad"])
    import_asset("lamp", "AI_PM_requirements_signal_lamp", location=(0.18, 0.08, -0.12), rotation=(0, 0.2, 0), target_size=0.26, material=mats["pad"])
    add_torus("AI_PM_requirements_landing_ring", mats["cyan"], location=(0, 0.06, 0), major_radius=0.3, minor_radius=0.009)
    add_sphere("AI_PM_requirements_beacon", mats["cyan"], location=(0, 0.34, 0), radius=0.04)
    add_anchor("socket.route.in", [-0.08, 0.08, -0.1])
    add_anchor("socket.route.out", [0.36, 0.08, 0.36])
    add_anchor("socket.card", [-0.08, 0.78, -0.02])
    add_anchor("socket.cameraFocus", [0, 0.08, 0])
    add_anchor("socket.lightKey", [0, 0.34, 0])


def build_version_harbor_island() -> None:
    mats = materials()
    import_asset("island", "AI_PM_versions_island", location=(0, -0.46, 0), rotation=(0, 0.38, 0), target_size=1.08, material=mats["rock"])
    import_asset("station_ring", "AI_PM_versions_station_ring", location=(0, -0.1, 0), rotation=(0, -0.2, 0), target_size=0.7, material=mats["pad"])
    import_asset("ground_hexes_b", "AI_PM_versions_hex_field", location=(-0.04, -0.24, 0.08), rotation=(0, 0.22, 0), target_size=0.5, material=mats["pad"])
    add_torus("AI_PM_versions_blue_ring", mats["blue"], location=(0, 0.05, 0), major_radius=0.44, minor_radius=0.01)
    add_sphere("AI_PM_versions_beacon", mats["blue"], location=(0, 0.28, 0), radius=0.042)
    add_anchor("socket.route.in", [-0.42, 0.02, -0.12])
    add_anchor("socket.route.out", [0.5, 0.04, -0.04])
    add_anchor("socket.card", [0.05, 0.72, 0.08])
    add_anchor("socket.cameraFocus", [0, -0.02, 0])
    add_anchor("socket.lightKey", [0, 0.28, 0])


def build_bug_repair_dock() -> None:
    mats = materials()
    import_asset("island", "AI_PM_bug_island", location=(0, -0.42, 0), rotation=(0, -0.22, 0), target_size=1.0, material=mats["rock"])
    import_asset("door", "AI_PM_bug_dock_door", location=(-0.03, -0.1, 0), rotation=(0, -0.36, 0), target_size=0.48, material=mats["pad"])
    import_asset("lamp", "AI_PM_bug_repair_beacon", location=(0.25, -0.04, -0.2), rotation=(0, 0.12, 0), target_size=0.38, material=mats["pad"])
    add_torus("AI_PM_bug_orange_ring", mats["orange"], location=(0, 0.02, 0), major_radius=0.37, minor_radius=0.01)
    add_box("AI_PM_bug_service_bridge", mats["pad"], location=(-0.32, -0.08, 0.18), scale=(0.32, 0.025, 0.075), rotation=(0, -0.35, 0))
    add_sphere("AI_PM_bug_hot_beacon", mats["orange"], location=(0.2, 0.23, -0.12), radius=0.045)
    add_anchor("socket.route.in", [-0.38, 0.02, -0.04])
    add_anchor("socket.route.out", [0.42, 0.06, -0.12])
    add_anchor("socket.card", [0.04, 0.68, 0.08])
    add_anchor("socket.cameraFocus", [0, -0.04, 0])
    add_anchor("socket.lightKey", [0.2, 0.23, -0.12])


def build_launch_gate_island() -> None:
    mats = materials()
    import_asset("island", "AI_PM_launch_island", location=(0, -0.46, 0), rotation=(0, -0.12, 0), target_size=1.08, material=mats["rock"])
    import_asset("station_yellow", "AI_PM_launch_station", location=(0, -0.12, 0), rotation=(0, 0.5, 0), target_size=0.7, material=mats["pad"])
    import_asset("ground_hex", "AI_PM_launch_pad", location=(0.02, -0.22, 0), rotation=(0, 0.15, 0), target_size=0.58, material=mats["pad"])
    add_torus("AI_PM_launch_orange_ring", mats["orange"], location=(0, 0.04, 0), major_radius=0.44, minor_radius=0.011)
    add_cylinder("AI_PM_launch_gate_column_a", mats["pad"], location=(-0.18, 0.22, 0.02), radius=0.035, depth=0.5, vertices=24)
    add_cylinder("AI_PM_launch_gate_column_b", mats["pad"], location=(0.18, 0.22, 0.02), radius=0.035, depth=0.5, vertices=24)
    add_sphere("AI_PM_launch_gate_beacon", mats["orange"], location=(0, 0.44, 0.02), radius=0.045)
    add_anchor("socket.route.in", [-0.48, 0.08, 0.1])
    add_anchor("socket.route.out", [0.12, 0.2, 0.08])
    add_anchor("socket.card", [-0.08, 0.8, 0.1])
    add_anchor("socket.cameraFocus", [0, 0.02, 0])
    add_anchor("socket.lightKey", [0, 0.44, 0.02])


def build_background_support_stations() -> None:
    mats = materials()
    import_asset("island", "AI_PM_background_left_island", location=(-0.85, -0.34, 0), rotation=(0, 0.64, 0), target_size=0.68, material=mats["rock"])
    import_asset("station_ring", "AI_PM_background_left_station", location=(-0.85, -0.1, 0), rotation=(0, 0.72, 0), target_size=0.42, material=mats["pad"])
    import_asset("island", "AI_PM_background_right_island", location=(0.78, -0.3, 0.12), rotation=(0, -0.42, 0), target_size=0.76, material=mats["rock"])
    import_asset("station_mini", "AI_PM_background_right_station", location=(0.78, -0.04, 0.12), rotation=(0, -0.35, 0), target_size=0.38, material=mats["pad"])
    add_box("AI_PM_background_bridge", mats["pad"], location=(0.0, -0.16, 0.04), scale=(0.64, 0.02, 0.045), rotation=(0, 0.1, 0))
    add_sphere("AI_PM_background_cyan_beacon", mats["cyan"], location=(-0.85, 0.18, 0), radius=0.03)
    add_sphere("AI_PM_background_magenta_beacon", mats["magenta"], location=(0.78, 0.18, 0.12), radius=0.028)
    add_anchor("socket.cameraFocus", [0, -0.02, 0.04])
    add_anchor("socket.lightKey", [0, 0.2, 0.04])


def build_airship_cruiser() -> None:
    mats = materials()
    import_asset("airship", "AI_PM_airship_cruiser_body", location=(0, 0, 0), rotation=(0, -math.pi / 2, 0), target_size=1.0, material=mats["airship"])
    add_sphere("AI_PM_airship_front_light", mats["cyan"], location=(0.42, 0.02, 0), radius=0.035)
    add_sphere("AI_PM_airship_rear_thruster", mats["orange"], location=(-0.52, -0.02, 0), radius=0.055)
    add_box("AI_PM_airship_window_strip", mats["cyan"], location=(0.02, 0.08, -0.03), scale=(0.3, 0.012, 0.012), rotation=(0, 0.02, 0))
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
            "placement": {"position": [0.64, -0.26, -1.28], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
            "sourceKeys": ["island", "station_ring", "station_mini"],
            "builder": build_background_support_stations,
            "anchors": {"socket.cameraFocus": [0.64, -0.28, -1.24], "socket.lightKey": [0.64, 0.0, -1.24]},
        },
        {
            "id": "central-command-station",
            "title": "中央主空间站",
            "role": "hero-station",
            "placement": {"position": [0.78, -0.08, -0.08], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
            "sourceKeys": ["island", "station_main", "station_pink"],
            "builder": build_central_command_station,
            "anchors": {"socket.cameraFocus": [0.78, 0.26, -0.08], "socket.lightKey": [0.78, 1.14, -0.08]},
        },
        {
            "id": "requirements-tower-island",
            "title": "需求塔台岛",
            "role": "chapter-node",
            "placement": {"position": [-1.34, -0.22, -0.08], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
            "sourceKeys": ["island", "ground_hexes_a", "station_mini", "lamp"],
            "builder": build_requirements_tower_island,
            "anchors": {"socket.card": [-1.42, 0.56, -0.1], "socket.cameraFocus": [-1.34, -0.14, -0.08]},
        },
        {
            "id": "version-harbor-island",
            "title": "版本航站岛",
            "role": "chapter-node",
            "placement": {"position": [-0.42, -0.52, 1.04], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
            "sourceKeys": ["island", "station_ring", "ground_hexes_b"],
            "builder": build_version_harbor_island,
            "anchors": {"socket.card": [-0.37, 0.2, 1.12], "socket.cameraFocus": [-0.42, -0.54, 1.04]},
        },
        {
            "id": "bug-repair-dock",
            "title": "Bug 维修坞",
            "role": "chapter-node",
            "placement": {"position": [1.34, -0.54, 1.22], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
            "sourceKeys": ["island", "door", "lamp"],
            "builder": build_bug_repair_dock,
            "anchors": {"socket.card": [1.38, 0.14, 1.3], "socket.cameraFocus": [1.34, -0.58, 1.22]},
        },
        {
            "id": "launch-gate-island",
            "title": "上线闸口岛",
            "role": "chapter-node",
            "placement": {"position": [2.34, -0.28, 0.16], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
            "sourceKeys": ["island", "station_yellow", "ground_hex"],
            "builder": build_launch_gate_island,
            "anchors": {"socket.card": [2.26, 0.52, 0.26], "socket.cameraFocus": [2.34, -0.26, 0.16]},
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
            "placement": {"position": [1.48, 0.28, 0.88], "rotation": [0, 0, 0], "scale": [0.38, 0.38, 0.38]},
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
            {"progress": 0.0, "position": [0.2, 1.55, 6.25], "target": [0.72, 0.05, 0.22]},
            {"progress": 0.28, "position": [-0.18, 1.35, 5.92], "target": [-0.72, -0.1, 0.55]},
            {"progress": 0.55, "position": [0.76, 1.34, 5.82], "target": [0.78, -0.08, 0.74]},
            {"progress": 0.78, "position": [1.42, 1.38, 5.7], "target": [1.5, -0.1, 0.86]},
            {"progress": 1.0, "position": [1.75, 1.48, 5.92], "target": [1.8, 0.02, 0.2]},
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
