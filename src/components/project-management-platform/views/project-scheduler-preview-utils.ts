export const resizingSourceClassName = "project-scheduler-event-resizing-source";

export type ResizePreviewSource = {
  cursor: string;
  eventElement: HTMLElement;
  innerHtml: string;
  innerStyle: string;
  sourceKey: string;
};

function addClassOnce(element: HTMLElement, className: string) {
  if (!element.classList.contains(className)) {
    element.classList.add(className);
  }
}

function setStylePropertyOnce(element: HTMLElement, propertyName: string, value: string) {
  if (element.style.getPropertyValue(propertyName) !== value) {
    element.style.setProperty(propertyName, value);
  }
}

function getEventPreviewKey(source: HTMLElement, sourceInner: HTMLElement) {
  // 预览身份只关心内容和主题类名；拖拽/拉伸中外层 style 会被 DayPilot 高频改写，放进 key 会导致每帧重灌 DOM。
  return [
    source.getAttribute("title") ?? sourceInner.textContent ?? "",
    source.getAttribute("class") ?? "",
    sourceInner.innerHTML,
    sourceInner.getAttribute("class") ?? ""
  ].join("|");
}

export function getResizePreviewSource(target: EventTarget | null): ResizePreviewSource | null {
  if (!(target instanceof HTMLElement) || !target.closest(".project-scheduler-resize-handle")) {
    return null;
  }

  const eventElement = target.closest<HTMLElement>(".project-scheduler-event-task");
  const sourceInner = eventElement?.querySelector<HTMLElement>(".scheduler_default_event_inner");

  if (!eventElement || !sourceInner) {
    return null;
  }

  // DayPilot 的 resize shadow 本身没有任务内容，这里记录源卡片，后续让预览条和源卡保持同一视觉。
  return {
    cursor: target.closest(".project-scheduler-resize-handle-start") ? "w-resize" : "e-resize",
    eventElement,
    innerHtml: sourceInner.innerHTML,
    innerStyle: sourceInner.getAttribute("style") ?? "",
    sourceKey: getEventPreviewKey(eventElement, sourceInner)
  };
}

export function clearResizePreviewSource(preview: ResizePreviewSource | null) {
  preview?.eventElement.classList.remove(resizingSourceClassName);
}

function syncShadowContent({
  cursor,
  mode,
  root,
  sourceInnerHtml,
  sourceInnerStyle,
  sourceKey
}: {
  cursor: string;
  mode: "drag" | "resize";
  root: HTMLElement;
  sourceInnerHtml: string;
  sourceInnerStyle: string;
  sourceKey: string;
}) {
  const shadow = root.querySelector<HTMLElement>(".scheduler_default_shadow");
  const shadowInner = shadow?.querySelector<HTMLElement>(".scheduler_default_shadow_inner");

  if (!shadow || !shadowInner) {
    return false;
  }

  // DayPilot 会创建跟随鼠标的 shadow；这里只复用它的位置，不再额外改线位，避免拖拽时整条任务被推错行。
  addClassOnce(shadow, "project-scheduler-drag-card");
  addClassOnce(shadowInner, "project-scheduler-drag-card-inner");
  if (mode === "resize") {
    addClassOnce(shadow, "project-scheduler-resize-card");
    addClassOnce(shadowInner, "project-scheduler-resize-card-inner");
  }
  setStylePropertyOnce(shadow, "opacity", "1");
  setStylePropertyOnce(shadow, "transform", "none");

  if (shadowInner.dataset.projectDragSource === sourceKey) {
    setStylePropertyOnce(shadowInner, "cursor", cursor);
    return true;
  }

  shadowInner.dataset.projectDragSource = sourceKey;
  shadowInner.innerHTML = sourceInnerHtml;
  shadowInner.setAttribute("style", sourceInnerStyle);
  setStylePropertyOnce(shadowInner, "cursor", cursor);
  setStylePropertyOnce(shadowInner, "opacity", "1");

  return true;
}

export function syncDraggingEventPreview(root: HTMLElement) {
  const source = root.querySelector<HTMLElement>(".scheduler_default_event_moving_source");
  const sourceInner = source?.querySelector<HTMLElement>(".scheduler_default_event_inner");

  if (!source || !sourceInner) {
    return false;
  }

  return syncShadowContent({
    cursor: "grabbing",
    mode: "drag",
    root,
    sourceInnerHtml: sourceInner.innerHTML,
    sourceInnerStyle: sourceInner.getAttribute("style") ?? "",
    sourceKey: getEventPreviewKey(source, sourceInner)
  });
}

export function syncResizingEventPreview(root: HTMLElement, preview: ResizePreviewSource | null) {
  if (!preview) {
    return false;
  }

  const synced = syncShadowContent({
    cursor: preview.cursor,
    mode: "resize",
    root,
    sourceInnerHtml: preview.innerHtml,
    sourceInnerStyle: preview.innerStyle,
    sourceKey: preview.sourceKey
  });

  if (synced) {
    preview.eventElement.classList.add(resizingSourceClassName);
  }

  return synced;
}
