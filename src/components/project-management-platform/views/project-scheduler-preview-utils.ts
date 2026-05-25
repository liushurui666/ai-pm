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

function getSourceTop(source: HTMLElement) {
  return source.style.getPropertyValue("top") || `${source.offsetTop}px`;
}

function lockShadowToSourceRow(shadow: HTMLElement, source: HTMLElement) {
  // 任务排期只允许横向改时间，拖拽预览的纵向位置必须锁回源任务行，避免中间态看起来像换了负责人或任务。
  setStylePropertyOnce(shadow, "top", getSourceTop(source));
}

function applyShadowInnerStyle(element: HTMLElement, sourceInnerStyle: string, cursor: string) {
  if (element.dataset.projectInnerStyle !== sourceInnerStyle) {
    element.setAttribute("style", sourceInnerStyle);
    element.dataset.projectInnerStyle = sourceInnerStyle;
  }

  setStylePropertyOnce(element, "cursor", cursor);
  setStylePropertyOnce(element, "opacity", "1");
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
  sourceElement,
  sourceInnerHtml,
  sourceInnerStyle,
  sourceKey
}: {
  cursor: string;
  mode: "drag" | "resize";
  root: HTMLElement;
  sourceElement: HTMLElement;
  sourceInnerHtml: string;
  sourceInnerStyle: string;
  sourceKey: string;
}) {
  const shadow = root.querySelector<HTMLElement>(".scheduler_default_shadow");
  const shadowInner = shadow?.querySelector<HTMLElement>(".scheduler_default_shadow_inner");

  if (!shadow || !shadowInner) {
    return false;
  }

  // DayPilot 会创建跟随鼠标的 shadow；这里保留横向位移，同时把纵向位置固定到源行。
  addClassOnce(shadow, "project-scheduler-drag-card");
  addClassOnce(shadowInner, "project-scheduler-drag-card-inner");
  if (mode === "resize") {
    addClassOnce(shadow, "project-scheduler-resize-card");
    addClassOnce(shadowInner, "project-scheduler-resize-card-inner");
  }
  lockShadowToSourceRow(shadow, sourceElement);
  setStylePropertyOnce(shadow, "opacity", "1");
  setStylePropertyOnce(shadow, "transform", "none");

  if (shadowInner.dataset.projectDragSource === sourceKey) {
    // 普通拖拽的 shadow 可能先出现、后补齐内联样式；内容相同时仍要同步样式，避免拖动中退回默认灰块。
    applyShadowInnerStyle(shadowInner, sourceInnerStyle, cursor);
    return true;
  }

  shadowInner.dataset.projectDragSource = sourceKey;
  shadowInner.innerHTML = sourceInnerHtml;
  applyShadowInnerStyle(shadowInner, sourceInnerStyle, cursor);

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
    sourceElement: source,
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
    sourceElement: preview.eventElement,
    sourceInnerHtml: preview.innerHtml,
    sourceInnerStyle: preview.innerStyle,
    sourceKey: preview.sourceKey
  });

  if (synced) {
    preview.eventElement.classList.add(resizingSourceClassName);
  }

  return synced;
}
