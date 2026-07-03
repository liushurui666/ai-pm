from __future__ import annotations

import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
SOURCE_MODEL = ROOT / "public/robot-story/models/RobotExpressive.glb"
OUTPUT_MODEL = ROOT / "public/robot-story/models/RobotExpressiveCyber.glb"


def clear_scene() -> None:
    """清空 Blender 默认场景，避免默认立方体/灯光被导出到运行时 GLB。"""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def set_principled_input(material: bpy.types.Material, name: str, value) -> None:
    """按名称设置 Principled BSDF 输入；Blender 版本差异会让部分输入不存在，因此这里做存在性保护。"""
    if not material.use_nodes:
        return

    node = material.node_tree.nodes.get("Principled BSDF")

    if node and name in node.inputs:
        node.inputs[name].default_value = value


def create_pbr_material(
    name: str,
    base_color: tuple[float, float, float, float],
    metallic: float,
    roughness: float,
    emission_color: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    """创建可导出到 glTF 的 PBR 材质，让科技感真正写进模型材质，而不是前端额外糊一层。"""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = base_color
    set_principled_input(material, "Base Color", base_color)
    set_principled_input(material, "Metallic", metallic)
    set_principled_input(material, "Roughness", roughness)

    if emission_color:
      set_principled_input(material, "Emission Color", emission_color)
      set_principled_input(material, "Emission Strength", emission_strength)

    return material


def replace_material_slots(material_map: dict[str, bpy.types.Material]) -> None:
    """替换原 GLB 的 Main/Grey/Black 材质槽，保留网格、骨骼、动画和 morph target 不变。"""
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue

        for slot in obj.material_slots:
            if slot.material and slot.material.name in material_map:
                slot.material = material_map[slot.material.name]


def assign_panel_material(obj_name: str, material: bpy.types.Material, selector) -> None:
    """把一部分原始面片改成发光线路材质；这些面片属于模型本体，不是运行时外贴平面。"""
    obj = bpy.data.objects.get(obj_name)

    if not obj or obj.type != "MESH":
        return

    obj.data.materials.append(material)
    material_index = len(obj.data.materials) - 1

    for polygon in obj.data.polygons:
        center = polygon.center

        if selector(center, polygon.normal):
            polygon.material_index = material_index


def add_bevel_and_weighted_normals() -> None:
    """给低模机器人加极轻倒角和加权法线，提升近景质感但不改变骨骼动画结构。"""
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue

        has_armature = any(modifier.type == "ARMATURE" for modifier in obj.modifiers)

        if obj.data.shape_keys or has_armature or obj.vertex_groups:
            # 机器人所有主要网格都依赖骨骼蒙皮；对 skinned mesh 应用倒角可能改变绑定姿态或权重结果。
            # 这里宁可放弃几何倒角，也要保留官方动作和站姿稳定，科技感主要通过 Blender PBR 材质完成。
            continue

        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)

        bevel = obj.modifiers.new("Cyber micro bevel", "BEVEL")
        bevel.width = 0.00018
        bevel.segments = 2
        bevel.affect = "EDGES"
        bevel.harden_normals = True

        weighted = obj.modifiers.new("Cyber weighted normals", "WEIGHTED_NORMAL")
        weighted.keep_sharp = True
        weighted.weight = 50

        # 导出前应用修改器，把更高精度边缘直接烘到 GLB，浏览器端无需再猜材质或法线效果。
        try:
            bpy.ops.object.modifier_apply(modifier=bevel.name)
            bpy.ops.object.modifier_apply(modifier=weighted.name)
        finally:
            obj.select_set(False)


def derive_cyber_robot() -> None:
    """生成机器人 cyber 材质派生模型，作为 /robot-story 的默认运行时资产。"""
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(SOURCE_MODEL))

    main_armor = create_pbr_material(
        "Cyber dark graphite armor",
        (0.035, 0.09, 0.12, 1.0),
        metallic=0.9,
        roughness=0.22,
        emission_color=(0.0, 0.18, 0.2, 1.0),
        emission_strength=0.04,
    )
    titanium_trim = create_pbr_material(
        "Cyber brushed titanium trim",
        (0.34, 0.47, 0.5, 1.0),
        metallic=1.0,
        roughness=0.16,
        emission_color=(0.0, 0.08, 0.09, 1.0),
        emission_strength=0.02,
    )
    optic_glass = create_pbr_material(
        "Cyber emissive optic glass",
        (0.015, 0.035, 0.05, 1.0),
        metallic=0.55,
        roughness=0.08,
        emission_color=(0.18, 1.0, 0.92, 1.0),
        emission_strength=1.8,
    )
    circuit_glow = create_pbr_material(
        "Cyber embedded circuit glow",
        (0.02, 0.35, 0.34, 1.0),
        metallic=0.35,
        roughness=0.18,
        emission_color=(0.1, 1.0, 0.86, 1.0),
        emission_strength=1.15,
    )
    warning_glow = create_pbr_material(
        "Cyber amber warning edge",
        (0.8, 0.64, 0.15, 1.0),
        metallic=0.45,
        roughness=0.2,
        emission_color=(1.0, 0.78, 0.18, 1.0),
        emission_strength=0.78,
    )

    replace_material_slots(
        {
            "Main": main_armor,
            "Grey": titanium_trim,
            "Black": optic_glass,
            "Material": titanium_trim,
        }
    )

    # 这些 selector 使用模型自身局部坐标挑选少量面片做“嵌入式线路”和“警示边”，
    # 它们会随原始骨骼动画变形，不再像 Three 里额外贴一层平面。
    assign_panel_material(
        "Torso",
        circuit_glow,
        lambda center, normal: abs(center.x) < 0.0028 and center.z > -0.001 and center.y > -0.003,
    )
    assign_panel_material(
        "Head",
        circuit_glow,
        lambda center, normal: abs(center.x) > 0.007 and center.z > -0.002 and center.y > -0.002,
    )
    assign_panel_material(
        "Hand.L",
        warning_glow,
        lambda center, normal: center.z > -0.001 and center.y < 0.0008,
    )
    assign_panel_material(
        "Hand.R",
        warning_glow,
        lambda center, normal: center.z > -0.001 and center.y < 0.0008,
    )

    add_bevel_and_weighted_normals()

    OUTPUT_MODEL.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_MODEL),
        export_format="GLB",
        export_animations=True,
        export_skins=True,
        export_morph=True,
        export_materials="EXPORT",
    )

    print(f"Derived cyber robot written to {OUTPUT_MODEL}")


if __name__ == "__main__":
    derive_cyber_robot()
