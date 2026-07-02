#!/usr/bin/env python3
"""用 Blender 把基础 Aero GLB 派生成 AI PM 首页可直接加载的组合场景。

这个脚本故意只做“模型资产二开”：
- `source/` 里的第三方 GLB 永远作为原始资产保留，便于回滚和替换；
- `processed/` 输出页面运行时加载的组合模型和飞艇模型；
- 航线流动、业务卡片和实时高亮继续交给前端 Three.js 运行时处理。
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


REPO_ROOT = Path(__file__).resolve().parents[2]
MODEL_ROOT = REPO_ROOT / "public" / "aero-system" / "models"
SOURCE_DIR = MODEL_ROOT / "source"
PROCESSED_DIR = MODEL_ROOT / "processed"


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


CARD_ANCHORS = [
    {
        "accent": "#55f0c7",
        "id": "requirements",
        "index": "01",
        "metric": "进行中 12/20",
        "position": [-1.72, 0.7, -0.18],
        "status": "进行中",
        "summary": "收集需求，拆解任务",
        "title": "需求塔台",
    },
    {
        "accent": "#48a8ff",
        "id": "versions",
        "index": "02",
        "metric": "进行中 v1.2.3",
        "position": [-0.42, 0.02, 1.08],
        "status": "进行中",
        "summary": "规划版本，分配资源",
        "title": "版本航站",
    },
    {
        "accent": "#ffbb55",
        "id": "bugs",
        "index": "03",
        "metric": "进行中 5 个待处理",
        "position": [1.38, -0.02, 1.28],
        "status": "进行中",
        "summary": "发现问题，修复验证",
        "title": "Bug 维修坞",
    },
    {
        "accent": "#57e2a2",
        "id": "launch",
        "index": "04",
        "metric": "准备就绪 v1.2.3",
        "position": [2.42, 0.72, 0.18],
        "status": "准备就绪",
        "summary": "验收合规，发布上线",
        "title": "上线闸口",
    },
]


ROUTE_ANCHORS = {
    "blue": [
        [-1.55, -0.08, -0.08],
        [-1.0, -0.12, 0.46],
        [-0.42, -0.2, 1.08],
        [0.44, -0.08, 0.62],
    ],
    "orange": [
        [0.44, -0.08, 0.62],
        [1.12, -0.18, 1.22],
        [1.78, 0.02, 0.92],
        [2.42, 0.1, 0.18],
    ],
}


def reset_scene() -> None:
    """清空默认场景，避免 Blender 默认相机/灯光被导出进运行时资产。"""

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def create_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
    metallic: float = 0.0,
    roughness: float = 0.45,
    alpha: float = 1.0,
) -> bpy.types.Material:
    """创建可被 glTF 导出的 PBR/自发光材质。

    Blender 版本升级后 Principled BSDF 的 socket 名可能有变化，所以这里用
    `if input in inputs` 的方式写入，避免脚本因为小版本差异直接失败。
    """

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


MAT_ROCK = create_material("AI_PM_dark_floating_rock", (0.035, 0.05, 0.065, 1), metallic=0.08, roughness=0.82)
MAT_PAD = create_material(
    "AI_PM_station_dark_metal",
    (0.055, 0.085, 0.115, 1),
    emission=(0.0, 0.08, 0.12, 1),
    emission_strength=0.08,
    metallic=0.72,
    roughness=0.32,
)
MAT_CYAN = create_material(
    "AI_PM_neon_cyan",
    (0.08, 0.95, 1.0, 1),
    emission=(0.0, 0.85, 1.0, 1),
    emission_strength=3.2,
    metallic=0.15,
    roughness=0.18,
)
MAT_BLUE = create_material(
    "AI_PM_route_blue",
    (0.05, 0.42, 1.0, 1),
    emission=(0.02, 0.36, 1.0, 1),
    emission_strength=2.6,
    metallic=0.2,
    roughness=0.2,
)
MAT_ORANGE = create_material(
    "AI_PM_route_orange",
    (1.0, 0.58, 0.1, 1),
    emission=(1.0, 0.42, 0.05, 1),
    emission_strength=2.8,
    metallic=0.2,
    roughness=0.2,
)
MAT_MAGENTA = create_material(
    "AI_PM_neon_magenta",
    (1.0, 0.18, 0.78, 1),
    emission=(1.0, 0.12, 0.72, 1),
    emission_strength=2.4,
    metallic=0.2,
    roughness=0.24,
)
MAT_GLASS = create_material(
    "AI_PM_hologram_glass",
    (0.22, 0.92, 0.86, 0.38),
    emission=(0.08, 0.75, 0.82, 1),
    emission_strength=0.8,
    metallic=0.0,
    roughness=0.12,
    alpha=0.38,
)
MAT_AIRSHIP = create_material(
    "AI_PM_airship_warm_metal",
    (0.62, 0.68, 0.72, 1),
    emission=(0.08, 0.18, 0.24, 1),
    emission_strength=0.16,
    metallic=0.58,
    roughness=0.34,
)


def get_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector, float]:
    """返回一组对象的世界包围盒中心、尺寸和最大边。

    第三方 GLB 原点、单位和缩放不统一；导入后必须归一化，否则组合出来
    会像多个贴片临时摆放，而不是一套统一的浮空航站。
    """

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
    """导入并归一化单个 GLB，返回一个统一控制的 Empty 根节点。"""

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
    root.empty_display_size = target_size * 0.24
    root.location = location
    root.rotation_euler = rotation
    root.scale = (target_size / max_dimension, target_size / max_dimension, target_size / max_dimension)

    imported_set = set(imported)
    top_level_objects = [obj for obj in imported if obj.parent not in imported_set]

    # 只能移动导入资产的顶层节点，不能把每个子 Mesh 都减一次中心点。
    # glTF 常带父子层级；如果拍平所有子节点，子级偏移会被重复计算，最终导出成巨大的错位模型。
    for obj in top_level_objects:
        obj.location -= center
        obj.parent = root

    for obj in imported:
        if obj.type == "MESH":
            obj.name = f"{name}_{obj.name}"
            if material:
                obj.data.materials.clear()
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
    """添加可导出的实体灯环，弥补基础 station GLB 灯带细节不足。"""

    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=128,
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
    vertices: int = 32,
) -> bpy.types.Object:
    """添加中心塔/信标塔等低成本几何，保证远景读形更接近目标图。"""

    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    cylinder = bpy.context.object
    cylinder.name = name
    cylinder.data.materials.append(material)
    return cylinder


def add_sphere(
    name: str,
    material: bpy.types.Material,
    *,
    location: tuple[float, float, float],
    radius: float,
) -> bpy.types.Object:
    """添加发光节点，前端再用 bloom 放大光晕。"""

    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=radius, location=location)
    sphere = bpy.context.object
    sphere.name = name
    sphere.data.materials.append(material)
    return sphere


def add_anchor(name: str, location: list[float]) -> None:
    """导出命名锚点，方便前端和设计稿坐标建立稳定映射。"""

    bpy.ops.object.empty_add(type="PLAIN_AXES", location=location)
    anchor = bpy.context.object
    anchor.name = f"AI_PM_ANCHOR_{name}"
    anchor.empty_display_size = 0.18


def add_scene_geometry() -> None:
    """组合基础 GLB 和补充几何，产出接近目标图的一体化航线模型。"""

    # 主空间站：用 station 主体 + 三层环 + 中心塔，替代之前运行时碎片化叠层。
    import_asset("island", "AI_PM_island_core", location=(0.82, -0.98, -0.08), rotation=(0, 0.22, 0), target_size=1.22, material=MAT_ROCK)
    import_asset("station_main", "AI_PM_station_core", location=(0.82, 0.46, -0.08), rotation=(0, -0.16, 0), target_size=1.5, material=MAT_PAD)
    import_asset("station_pink", "AI_PM_station_core_magenta_ring", location=(0.82, 0.6, -0.08), rotation=(0, 0.08, 0), target_size=1.62, material=MAT_PAD)
    add_torus("AI_PM_core_outer_magenta_runway", MAT_MAGENTA, location=(0.82, 0.66, -0.08), major_radius=0.82, minor_radius=0.014)
    add_torus("AI_PM_core_inner_cyan_runway", MAT_CYAN, location=(0.82, 0.74, -0.08), major_radius=0.42, minor_radius=0.01)
    add_cylinder("AI_PM_core_command_tower", MAT_PAD, location=(0.82, 1.08, -0.08), radius=0.09, depth=0.78, vertices=40)
    add_torus("AI_PM_core_tower_signal_ring", MAT_MAGENTA, location=(0.82, 1.44, -0.08), major_radius=0.18, minor_radius=0.008)
    add_sphere("AI_PM_core_top_beacon", MAT_CYAN, location=(0.82, 1.56, -0.08), radius=0.052)

    # 左侧需求塔台：偏小但有清晰蓝绿锚点，用于首张卡片。
    import_asset("island", "AI_PM_island_requirements", location=(-1.28, -0.62, -0.1), rotation=(0, -0.45, 0), target_size=0.92, material=MAT_ROCK)
    import_asset("ground_hexes_a", "AI_PM_pad_requirements", location=(-1.28, -0.34, -0.1), rotation=(0, 0.2, 0), target_size=0.62, material=MAT_PAD)
    import_asset("station_mini", "AI_PM_tower_requirements", location=(-1.28, -0.14, -0.1), rotation=(0, -0.15, 0), target_size=0.42, material=MAT_PAD)
    add_torus("AI_PM_requirements_landing_ring", MAT_CYAN, location=(-1.28, -0.12, -0.1), major_radius=0.28, minor_radius=0.009)
    add_sphere("AI_PM_requirements_beacon", MAT_CYAN, location=(-1.28, 0.16, -0.1), radius=0.038)

    # 下方版本航站：蓝色航线落点，保持和截图中下方节点接近。
    import_asset("island", "AI_PM_island_versions", location=(-0.32, -0.82, 1.02), rotation=(0, 0.38, 0), target_size=1.08, material=MAT_ROCK)
    import_asset("station_ring", "AI_PM_station_versions", location=(-0.32, -0.48, 1.02), rotation=(0, -0.2, 0), target_size=0.68, material=MAT_PAD)
    add_torus("AI_PM_versions_blue_ring", MAT_BLUE, location=(-0.32, -0.34, 1.02), major_radius=0.42, minor_radius=0.009)
    add_sphere("AI_PM_versions_beacon", MAT_BLUE, location=(-0.32, -0.1, 1.02), radius=0.04)

    # 右下 Bug 维修坞：暖色路线的中段节点。
    import_asset("island", "AI_PM_island_bugs", location=(1.28, -0.84, 1.24), rotation=(0, -0.22, 0), target_size=0.98, material=MAT_ROCK)
    import_asset("door", "AI_PM_bug_dock_door", location=(1.28, -0.5, 1.24), rotation=(0, -0.36, 0), target_size=0.44, material=MAT_PAD)
    import_asset("lamp", "AI_PM_bug_repair_beacon", location=(1.58, -0.4, 1.02), rotation=(0, 0.12, 0), target_size=0.42, material=MAT_PAD)
    add_torus("AI_PM_bug_orange_ring", MAT_ORANGE, location=(1.28, -0.38, 1.24), major_radius=0.36, minor_radius=0.009)

    # 右侧上线闸口：橙色终点，靠近目标图右侧平台。
    import_asset("island", "AI_PM_island_launch", location=(2.38, -0.62, 0.16), rotation=(0, -0.12, 0), target_size=1.08, material=MAT_ROCK)
    import_asset("station_yellow", "AI_PM_station_launch", location=(2.38, -0.28, 0.16), rotation=(0, 0.5, 0), target_size=0.68, material=MAT_PAD)
    import_asset("ground_hex", "AI_PM_launch_pad", location=(2.38, -0.38, 0.16), rotation=(0, 0.15, 0), target_size=0.56, material=MAT_PAD)
    add_torus("AI_PM_launch_orange_ring", MAT_ORANGE, location=(2.38, -0.16, 0.16), major_radius=0.42, minor_radius=0.01)
    add_sphere("AI_PM_launch_beacon", MAT_ORANGE, location=(2.38, 0.1, 0.16), radius=0.042)

    # 远景平台和云下地面只服务空间深度，不作为主业务节点。
    import_asset("island", "AI_PM_island_far_left", location=(-0.02, -0.6, -1.16), rotation=(0, 0.64, 0), target_size=0.64, material=MAT_ROCK)
    import_asset("station_ring", "AI_PM_station_far_left", location=(-0.02, -0.38, -1.16), rotation=(0, 0.72, 0), target_size=0.38, material=MAT_PAD)
    import_asset("island", "AI_PM_island_far_right", location=(2.02, -0.58, -1.0), rotation=(0, -0.42, 0), target_size=0.72, material=MAT_ROCK)
    import_asset("station_mini", "AI_PM_station_far_right", location=(2.02, -0.34, -1.0), rotation=(0, -0.35, 0), target_size=0.36, material=MAT_PAD)

    # 少量植物/地貌只做轮廓破碎，避免画面全是圆盘。
    import_asset("tree", "AI_PM_signal_tree_a", location=(-1.12, -0.1, 0.14), rotation=(0, 0.2, 0), target_size=0.22, material=MAT_PAD)
    import_asset("tree", "AI_PM_signal_tree_b", location=(1.06, -0.32, 1.62), rotation=(0, -0.8, 0), target_size=0.18, material=MAT_PAD)

    for card in CARD_ANCHORS:
        add_anchor(card["id"], card["position"])
    add_anchor("center_station", [0.72, 0.42, -0.08])
    add_anchor("airship_path", [1.82, 0.38, 0.82])


def export_scene() -> None:
    """导出组合场景，并写入前端读取的 manifest。"""

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    output = PROCESSED_DIR / "aero-harbor-scene.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        use_selection=False,
    )

    manifest = {
        "generatedBy": "scripts/aero-system/derive-aero-scene.py",
        "scene": "/aero-system/models/processed/aero-harbor-scene.glb",
        "airship": "/aero-system/models/processed/aero-airship-hero.glb",
        "sourceDirectory": "/aero-system/models/source",
        "cards": CARD_ANCHORS,
        "routes": ROUTE_ANCHORS,
    }
    (MODEL_ROOT / "aero-scene.manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def export_airship() -> None:
    """单独导出飞艇，前端可以沿航线做轻量运动，不影响静态组合场景。"""

    reset_scene()
    airship = import_asset(
        "airship",
        "AI_PM_airship_hero",
        location=(0, 0, 0),
        rotation=(0, -math.pi / 2, 0),
        target_size=1.0,
        material=MAT_AIRSHIP,
    )
    add_sphere("AI_PM_airship_front_light", MAT_CYAN, location=(0.42, 0.02, 0), radius=0.035)
    add_sphere("AI_PM_airship_rear_thruster", MAT_ORANGE, location=(-0.52, -0.02, 0), radius=0.055)
    airship["ai_pm_role"] = "delivery_airship"
    bpy.ops.export_scene.gltf(
        filepath=str(PROCESSED_DIR / "aero-airship-hero.glb"),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        use_selection=False,
    )


def main() -> None:
    """生成全部 processed 模型。"""

    reset_scene()
    add_scene_geometry()
    export_scene()
    export_airship()


if __name__ == "__main__":
    main()
