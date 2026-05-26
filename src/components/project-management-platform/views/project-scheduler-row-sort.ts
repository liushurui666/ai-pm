import type { ProjectSchedulerTaskOrderChange } from "@/components/project-management-platform/views/project-scheduler-utils";

type RowSortPointerEvent = PointerEvent | MouseEvent;

type RowSortDragState = {
  activeId: string;
  lastChangeKey: string;
  moved: boolean;
  offsetX: number;
  offsetY: number;
  owner: string;
  preview: HTMLElement;
  startY: number;
};

function getTaskPanel(target: EventTarget | null) {
  return target instanceof HTMLElement
    ? target.closest<HTMLElement>(".project-scheduler-resource-panel-task")
    : null;
}

function getPanelByTaskId(shell: HTMLElement, taskId: string) {
  return [...shell.querySelectorAll<HTMLElement>(".project-scheduler-resource-panel-task")]
    .find((panel) => panel.dataset.projectTaskId === taskId) ?? null;
}

function clearDropTarget(shell: HTMLElement) {
  shell
    .querySelectorAll(".project-scheduler-row-drop-before, .project-scheduler-row-drop-after")
    .forEach((node) => {
      node.classList.remove("project-scheduler-row-drop-before", "project-scheduler-row-drop-after");
    });
}

function clearActiveSource(shell: HTMLElement) {
  shell
    .querySelectorAll(".project-scheduler-row-sort-active")
    .forEach((node) => node.classList.remove("project-scheduler-row-sort-active"));
}

function markActiveSource(shell: HTMLElement, activeId: string) {
  clearActiveSource(shell);
  getPanelByTaskId(shell, activeId)?.classList.add("project-scheduler-row-sort-active");
}

function createDragPreview(sourcePanel: HTMLElement, event: RowSortPointerEvent) {
  const sourceRect = sourcePanel.getBoundingClientRect();
  const preview = sourcePanel.cloneNode(true) as HTMLElement;

  preview.classList.add("project-scheduler-row-drag-preview");
  preview.style.width = `${sourceRect.width}px`;
  preview.style.height = `${sourceRect.height}px`;
  document.body.appendChild(preview);

  return {
    offsetX: event.clientX - sourceRect.left,
    offsetY: event.clientY - sourceRect.top,
    preview
  };
}

function positionDragPreview(state: RowSortDragState, event: RowSortPointerEvent) {
  const x = Math.round(event.clientX - state.offsetX);
  const y = Math.round(event.clientY - state.offsetY);

  state.preview.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

function findPanelAtPointer(event: RowSortPointerEvent) {
  return document
    .elementsFromPoint(event.clientX, event.clientY)
    .map((element) => element.closest?.(".project-scheduler-resource-panel-task") ?? null)
    .find((element): element is HTMLElement => element instanceof HTMLElement) ?? null;
}

export function attachProjectSchedulerRowSort({
  dragMoveThreshold,
  onTaskOrderChange,
  shell
}: {
  dragMoveThreshold: number;
  onTaskOrderChange: (change: ProjectSchedulerTaskOrderChange) => void;
  shell: HTMLElement;
}) {
  let dragState: RowSortDragState | null = null;

  function resetDrag() {
    if (dragState) {
      dragState.preview.remove();
    }

    clearDropTarget(shell);
    clearActiveSource(shell);
    shell.classList.remove("project-scheduler-row-sorting");
    dragState = null;
  }

  function applyHoverReorder(event: RowSortPointerEvent) {
    if (!dragState) {
      return;
    }

    const targetPanel = findPanelAtPointer(event);
    const targetId = targetPanel?.dataset.projectTaskId;
    const targetOwner = targetPanel?.dataset.projectTaskOwner;

    clearDropTarget(shell);
    markActiveSource(shell, dragState.activeId);

    if (!targetPanel || !targetId || !targetOwner || targetId === dragState.activeId || targetOwner !== dragState.owner) {
      return;
    }

    const targetRect = targetPanel.getBoundingClientRect();
    const placement: ProjectSchedulerTaskOrderChange["placement"] =
      event.clientY > targetRect.top + targetRect.height / 2 ? "after" : "before";
    const changeKey = `${targetId}:${placement}`;

    targetPanel.classList.add(placement === "after" ? "project-scheduler-row-drop-after" : "project-scheduler-row-drop-before");

    if (changeKey === dragState.lastChangeKey) {
      return;
    }

    dragState.lastChangeKey = changeKey;

    // 拖过同负责人任务时即时换位，让列表在松手前就呈现“让位/替换”的过程。
    onTaskOrderChange({
      activeId: dragState.activeId,
      overId: targetId,
      owner: dragState.owner,
      placement
    });

    window.requestAnimationFrame(() => {
      if (dragState) {
        markActiveSource(shell, dragState.activeId);
      }
    });
  }

  function handlePointerDown(event: RowSortPointerEvent) {
    if (dragState) {
      return;
    }

    const handle = event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>(".project-scheduler-row-sort-handle")
      : null;

    if (!handle) {
      return;
    }

    const sourcePanel = getTaskPanel(handle);
    const activeId = sourcePanel?.dataset.projectTaskId;
    const owner = sourcePanel?.dataset.projectTaskOwner;

    if (!sourcePanel || !activeId || !owner) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const preview = createDragPreview(sourcePanel, event);
    dragState = {
      activeId,
      lastChangeKey: "",
      moved: false,
      offsetX: preview.offsetX,
      offsetY: preview.offsetY,
      owner,
      preview: preview.preview,
      startY: event.clientY
    };

    shell.classList.add("project-scheduler-row-sorting");
    markActiveSource(shell, activeId);
    positionDragPreview(dragState, event);
  }

  function handlePointerMove(event: RowSortPointerEvent) {
    if (!dragState) {
      return;
    }

    event.preventDefault();
    positionDragPreview(dragState, event);

    if (!dragState.moved && Math.abs(event.clientY - dragState.startY) > dragMoveThreshold) {
      // 只有超过阈值才触发换位，轻点手柄不会让列表跳动。
      dragState.moved = true;
    }

    if (dragState.moved) {
      applyHoverReorder(event);
    }
  }

  shell.addEventListener("pointerdown", handlePointerDown);
  shell.addEventListener("mousedown", handlePointerDown);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("mousemove", handlePointerMove);
  window.addEventListener("pointerup", resetDrag);
  window.addEventListener("mouseup", resetDrag);
  window.addEventListener("pointercancel", resetDrag);

  return () => {
    resetDrag();
    shell.removeEventListener("pointerdown", handlePointerDown);
    shell.removeEventListener("mousedown", handlePointerDown);
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("mousemove", handlePointerMove);
    window.removeEventListener("pointerup", resetDrag);
    window.removeEventListener("mouseup", resetDrag);
    window.removeEventListener("pointercancel", resetDrag);
  };
}
