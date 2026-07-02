"use client";

import "./index.less";
import { ArrowLeftOutlined, DownloadOutlined } from "@ant-design/icons";
import { Button, Select, Tag } from "antd";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  defaultUnitreeModelKey,
  unitreeModelCatalog,
  type UnitreeModelKey,
} from "@/lib/unitree-models/catalog";
import { useUnitreeModelScene } from "./use-unitree-model-scene";

// 独立模型预览页服务于本地资产验收：页面只提供模型切换和下载入口，不接入工作台导航和业务状态。
export function UnitreeModelPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [modelKey, setModelKey] = useState<UnitreeModelKey>(defaultUnitreeModelKey);
  const [status, setStatus] = useState("准备加载");
  const selectedModel = useMemo(
    () => unitreeModelCatalog.find((model) => model.key === modelKey) ?? unitreeModelCatalog[0],
    [modelKey]
  );

  const handleStatusChange = useCallback((nextStatus: string) => {
    setStatus(nextStatus);
  }, []);

  useUnitreeModelScene({
    canvasRef,
    modelKey,
    onStatusChange: handleStatusChange,
  });

  const modelOptions = unitreeModelCatalog.map((model) => ({
    label: `${model.label} · ${model.sizeMb.toFixed(1)}MB`,
    value: model.key,
  }));

  return (
    <main className="unitree-preview">
      <section className="unitree-preview__stage" aria-label="Unitree GLB 模型预览">
        <canvas ref={canvasRef} className="unitree-preview__canvas" />
        <div className="unitree-preview__vignette" aria-hidden="true" />
      </section>

      <aside className="unitree-preview__panel">
        <div className="unitree-preview__topbar">
          <Link href="/" aria-label="返回首页">
            <Button shape="circle" icon={<ArrowLeftOutlined />} />
          </Link>
          <Tag color={status === "已加载" ? "success" : status === "加载失败" ? "error" : "processing"}>
            {status}
          </Tag>
        </div>

        <div className="unitree-preview__identity">
          <span>{selectedModel.kind}</span>
          <h1>{selectedModel.label}</h1>
        </div>

        <Select<UnitreeModelKey>
          className="unitree-preview__select"
          options={modelOptions}
          value={modelKey}
          onChange={setModelKey}
        />

        <div className="unitree-preview__stats">
          <div>
            <span>文件</span>
            <strong>{selectedModel.sizeMb.toFixed(2)} MB</strong>
          </div>
          <div>
            <span>网格</span>
            <strong>{selectedModel.geometryCount}</strong>
          </div>
          <div>
            <span>尺寸</span>
            <strong>{selectedModel.extents.map((value) => `${value.toFixed(2)}m`).join(" / ")}</strong>
          </div>
        </div>

        <div className="unitree-preview__actions">
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            href={`/api/unitree-models?model=${selectedModel.key}`}
          >
            下载 GLB
          </Button>
        </div>
      </aside>
    </main>
  );
}
