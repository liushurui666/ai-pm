#!/usr/bin/env python3
"""校验 Aero 派生模型包是否满足前端运行时要求。"""

from __future__ import annotations

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MODEL_ROOT = REPO_ROOT / "public" / "aero-system" / "models"
SCENE_MANIFEST_PATH = MODEL_ROOT / "aero-flight-scene.manifest.json"
EXPECTED_MODEL_COUNT = 8


def fail(message: str) -> None:
    """用统一错误格式输出，方便 CI 或本地脚本直接定位失败项。"""

    print(f"[aero-models:validate] {message}", file=sys.stderr)
    raise SystemExit(1)


def read_json(path: Path) -> dict:
    """读取 JSON 并在解析失败时给出明确文件路径。"""

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"missing file: {path.relative_to(REPO_ROOT)}")
    except json.JSONDecodeError as exc:
        fail(f"invalid json: {path.relative_to(REPO_ROOT)} ({exc})")


def require_file(path: Path, *, min_size: int = 1) -> None:
    """检查文件存在且不是空文件，避免空 GLB/PNG 被误提交。"""

    if not path.exists():
        fail(f"missing file: {path.relative_to(REPO_ROOT)}")
    if path.stat().st_size < min_size:
        fail(f"file too small: {path.relative_to(REPO_ROOT)}")


def validate_model(model: dict) -> None:
    """校验单个派生模型目录和模型级 manifest。"""

    model_id = model.get("id")
    if not isinstance(model_id, str) or not model_id:
        fail("model id is required")

    model_dir = MODEL_ROOT / "derived" / model_id
    model_manifest_path = model_dir / "manifest.json"
    model_manifest = read_json(model_manifest_path)
    if model_manifest.get("id") != model_id:
        fail(f"manifest id mismatch: {model_manifest_path.relative_to(REPO_ROOT)}")

    require_file(model_dir / "model.glb", min_size=1024)
    require_file(model_dir / "preview.png", min_size=1024)
    require_file(model_dir / "README.md", min_size=64)

    blender_file = model_manifest.get("blenderFile")
    if not isinstance(blender_file, str) or not blender_file:
        fail(f"missing blenderFile in {model_id}")
    require_file(REPO_ROOT / blender_file, min_size=1024)

    placement = model_manifest.get("placement")
    if not isinstance(placement, dict):
        fail(f"missing placement in {model_id}")
    for key in ("position", "rotation", "scale"):
        value = placement.get(key)
        if not isinstance(value, list) or len(value) != 3:
            fail(f"invalid placement.{key} in {model_id}")

    anchors = model_manifest.get("anchors")
    if not isinstance(anchors, dict) or "socket.cameraFocus" not in anchors and model_id != "airship-cruiser":
        fail(f"missing required camera anchor in {model_id}")

    if model_manifest.get("role") == "chapter-node" and "socket.card" not in anchors:
        fail(f"chapter model missing socket.card: {model_id}")

    if model_id == "airship-cruiser":
        for anchor_name in ("socket.nose", "socket.thruster"):
            if anchor_name not in anchors:
                fail(f"airship missing {anchor_name}")


def main() -> None:
    """入口：校验场景 manifest 和所有派生模型包。"""

    scene_manifest = read_json(SCENE_MANIFEST_PATH)
    models = scene_manifest.get("models")
    if not isinstance(models, list) or len(models) != EXPECTED_MODEL_COUNT:
        fail(f"expected {EXPECTED_MODEL_COUNT} derived models, got {len(models) if isinstance(models, list) else 'invalid'}")

    for section in ("cards", "routes", "flightPath", "cameraKeyframes"):
        if section not in scene_manifest:
            fail(f"scene manifest missing {section}")

    for model in models:
        validate_model(model)

    print(f"[aero-models:validate] ok, {len(models)} derived model packages verified.")


if __name__ == "__main__":
    main()
