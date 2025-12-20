<template>
  <div class="dgrrb-gantt-wrap">
    <div class="dgrrb-gantt-debug" v-if="tasks.length">
      GanttTasks: {{ lastParsedCount }} / {{ tasks.length }}
    </div>
    <div ref="el" class="dgrrb-gantt" />
  </div>
</template>

<script setup lang="ts">
import "dhtmlx-gantt/codebase/dhtmlxgantt.css";
import { gantt } from "dhtmlx-gantt";
import type { Plugin } from "siyuan";
import { confirm, Menu, openTab, Dialog } from "siyuan";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createApp } from "vue";
import type { Task } from "@/domain/task";
import { extractId } from "@/domain/task";
import TaskDetailDialog from "./TaskDetailDialog.vue";

const props = defineProps<{
  plugin: Plugin;
  tasks: Task[];
  /** map of keyID -> type */
  keyTypeById: Record<string, string>;
  /** current config */
  config: {
    avID: string;
    startKeyID?: string;
    endKeyID?: string;
    statusKeyID?: string;
    parentKeyID?: string;
    progressKeyID?: string;
  };
  /** raw data from renderAttributeView */
  rawData?: any;
  onUpdate: (payload: {
    rowId: string;
    start?: string;
    end?: string;
    progress?: number;
    parentId?: string;
  }) => Promise<void> | void;
  onCreate: (payload: {
    text: string;
    parent?: string;
    start_date: Date;
    duration: number;
  }) => Promise<void> | void;
  onDelete: (rowId: string) => Promise<void> | void;
}>();

const el = ref<HTMLDivElement>();
const isApplying = ref(false);
const lastParsedCount = ref(0);
const ganttEvents: string[] = [];

const ganttIdByRef = computed(() => {
  const m = new Map<string, string>();
  for (const t of props.tasks) {
    const id = String(t.blockId || t.docId);
    m.set(t.docId, id);
    if (t.blockId)
      m.set(String(t.blockId), id);
  }
  return m;
});

function toDate(s?: string): Date {
  if (!s)
    return new Date();
  return new Date(`${s}T00:00:00`);
}

function toYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function diffDays(start: Date, end: Date): number {
  const ms = 24 * 60 * 60 * 1000;
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const b = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  const d = Math.round((b - a) / ms);
  // Add 1 to make it inclusive (e.g. 14th to 18th is 5 days)
  return Math.max(1, d + 1);
}

function applyTasks() {
  if (!el.value)
    return;
  isApplying.value = true;
  try {
    // For hierarchy detection: identify which IDs are actually consumed as parents
    const parentIdsInUse = new Set<string>();
    const taskListForGantt = props.tasks.map((t) => {
      const id = String(t.blockId || t.docId);
      const parentRef = t.parentId ? extractId(t.parentId).trim() : "";
      
      // Resolve parentRef to the actual ID used in the Gantt chart
      let parent: string | number = 0;
      if (props.config.parentKeyID && parentRef) {
          const resolved = ganttIdByRef.value.get(parentRef);
          if (resolved) {
              parent = String(resolved);
          } else {
              console.info(`[dgrrb] parentRef "${parentRef}" not found in current view for task "${t.title}"`);
          }
      }
      
      // If we found a parent ID, but it's the SAME as our current ID, set to 0 to prevent cycles
      if (String(parent) === id) {
          parent = 0;
      }

      if (parent !== 0)
        parentIdsInUse.add(String(parent));

      return { t, id, parent };
    });

    const data = taskListForGantt.map(({ t, id, parent }) => {
      const start = t.start ? toDate(t.start) : new Date();
      const end = t.end ? toDate(t.end) : start;
      const progress = t.progress !== undefined && t.progress !== null ? Math.max(0, Math.min(1, t.progress / 100)) : 0;
      
      const hasChildren = parentIdsInUse.has(id);

      return {
        id,
        text: t.title,
        start_date: start,
        duration: diffDays(start, end),
        progress,
        parent,
        type: hasChildren ? "project" : "task",
        rowId: t.docId, 
        open: true,
      };
    });

    console.info("[dgrrb] gantt ID mapping:", Object.fromEntries(ganttIdByRef.value));
    console.info("[dgrrb] gantt task data:", data.map(d => ({ 
      id: d.id, 
      parent: d.parent, 
      parentType: typeof d.parent,
      text: d.text 
    })));

    gantt.clearAll();
    (gantt as any).parse({ data, tasks: data });
    lastParsedCount.value = (gantt as any).getTaskCount?.() ?? data.length;
    gantt.render();
    console.info("[dgrrb] gantt parsed count:", lastParsedCount.value);
  } catch (err) {
    console.error("[dgrrb] gantt apply error:", err);
  } finally {
    // tiny delay to avoid event bursts
    setTimeout(() => {
      isApplying.value = false;
    }, 0);
  }
}

onMounted(() => {
  if (!el.value)
    return;

  gantt.config.autosize = "y";
  gantt.config.fit_tasks = true;
  gantt.config.open_tree_initially = true;
  gantt.config.show_progress = true;
  gantt.config.min_column_width = 40;
  gantt.config.row_height = 28;
  gantt.config.bar_height = 20;
  gantt.config.grid_width = 360;
  gantt.config.date_format = "%Y-%m-%d %H:%i";

  gantt.config.details_on_create = false; // Fast creation without lightbox

  // Enable reordering and tree maintenance
  gantt.config.order_branch = true;
  gantt.config.order_branch_free = true;
  gantt.config.grid_indent = 30; // More space for tree indentation

  gantt.templates.grid_row_class = (start: Date, end: Date, task: any) => {
    if (gantt.hasChild(task.id))
      return "dgrrb-gantt-parent-row";
    return "";
  };

  gantt.templates.task_class = (start: Date, end: Date, task: any) => {
    if (gantt.hasChild(task.id))
      return "dgrrb-gantt-parent-task";
    return "";
  };

  gantt.config.scales = [
    { unit: "month", step: 1, format: "%Y-%m" },
    { unit: "day", step: 1, format: "%m-%d" },
  ];

  gantt.config.columns = [
    {
      name: "text",
      label: "任务",
      tree: true,
      width: 220,
      template: (t: any) => {
        const hasChild = gantt.hasChild(t.id);
        const rowId = t.rowId || (ganttIdByRef.value.get(String(t.id)));
        const detailBtnId = `dgrrb-detail-btn-${t.id}`;
        return `
          <div style="display: flex; align-items: center; gap: 4px;">
            <span class="${hasChild ? 'dgrrb-gantt-bold' : ''}">${t.text}</span>
            <button 
              id="${detailBtnId}"
              class="dgrrb-gantt-detail-btn" 
              data-row-id="${rowId}"
              style="
                background: none;
                border: none;
                cursor: pointer;
                padding: 2px 4px;
                opacity: 0.6;
                font-size: 12px;
              "
              title="查看详情"
            >查看详情</button>
          </div>
        `;
      },
    },
    { name: "start_date", label: "开始", align: "center", width: 80 },
    { name: "end_date", label: "结束", align: "center", width: 80 },
    { name: "progress", label: "进度", align: "center", width: 60, template: (t: any) => `${Math.round((t.progress || 0) * 100)}%` },
    { name: "add", label: "", width: 44 },
  ];

  // open doc on double click
  // open doc on double click
  ganttEvents.push(gantt.attachEvent("onTaskDblClick", (id: string | number) => {
    const task = gantt.getTask(id) as any;
    const rowId = task?.rowId || (ganttIdByRef.value.get(String(id)));
    if (rowId) {
      openTab({
        app: props.plugin.app,
        doc: { id: rowId },
        openNewTab: true,
      });
    }
    return false;
  }));

  const sync = async (id: string | number) => {
    if (isApplying.value)
      return;
    const task = gantt.getTask(id) as any;
    const rowId = task?.rowId || (ganttIdByRef.value.get(String(id)));
    if (!rowId)
      return;

    // start_date is Date inside gantt after parsing
    const start = task.start_date ? toYmd(task.start_date) : undefined;
    let end: string | undefined;
    if (task.end_date) {
      // Gantt uses exclusive end date (start of next day). 
      // Subtract 1 day to convert back to inclusive end date for SiYuan.
      const d = new Date(task.end_date.getTime() - 24 * 60 * 60 * 1000);
      end = toYmd(d);
    }

    // Resolve parent back to original docId/blockId string expected by SiYuan
    // Gantt's task.parent is the ID of the parent task (or 0)
    let parentId = "";
    if (task.parent && task.parent !== 0) {
      parentId = String(task.parent);
    }

    const payload = {
      rowId,
      start,
      end,
      progress: task.progress !== undefined ? Math.round(task.progress * 100) : undefined,
      parentId,
    };
    console.debug("[dgrrb] gantt sync payload:", payload);
    await props.onUpdate(payload);
  };

  // sync edits/drag/progress/indent
  // sync edits/drag/progress/indent
  ganttEvents.push(gantt.attachEvent("onAfterTaskUpdate", async (id: string) => {
    await sync(id);
  }));
  ganttEvents.push(gantt.attachEvent("onAfterTaskDrag", async (id: string) => {
    await sync(id);
  }));
  ganttEvents.push(gantt.attachEvent("onAfterTaskMove", async (id: string) => {
    await sync(id);
  }));

  ganttEvents.push(gantt.attachEvent("onAfterTaskAdd", async (id: string, task: any) => {
    if (isApplying.value)
      return;
    await props.onCreate({
      text: task.text,
      parent: task.parent && task.parent !== 0 ? String(task.parent) : undefined,
      start_date: task.start_date,
      duration: task.duration,
    });
  }));

  // 处理右键菜单事件
  ganttEvents.push(gantt.attachEvent("onContextMenu", (taskId: string | number) => {
    // 只在任务上显示右键菜单
    if (!taskId) {
      return true; // 允许默认行为
    }
    return false; // 阻止默认行为
  }));

  // 监听甘特图容器的右键点击事件
  let handleContextMenu: ((e: MouseEvent) => void) | null = null;
  if (el.value) {
    handleContextMenu = async (e: MouseEvent) => {
      // 检查是否点击在任务行上
      const target = e.target as HTMLElement;
      const taskRow = target.closest(".gantt_row");
      if (!taskRow) {
        return;
      }

      // 获取任务ID
      const taskIdAttr = taskRow.getAttribute("task_id");
      if (!taskIdAttr) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const taskId = taskIdAttr;
      const task = gantt.getTask(taskId) as any;
      if (!task) {
        return;
      }

      const rowId = task?.rowId || (ganttIdByRef.value.get(String(taskId)));
      if (!rowId) {
        return;
      }

      // 使用思源的 Menu API 创建右键菜单
      const menu = new Menu();
      
      menu.addItem({
        icon: "iconPlus",
        label: "添加子任务",
        click: () => {
          const parentGanttId = String(taskId);
          const newTask = {
            text: "新子任务",
            start_date: task.start_date || new Date(),
            duration: 1,
            parent: parentGanttId,
          };
          gantt.addTask(newTask, parentGanttId);
          // onAfterTaskAdd 会自动触发 onCreate
        },
      });

      menu.addItem({
        icon: "iconTrashcan",
        label: "删除任务",
        click: async () => {
          confirm(
            "删除任务",
            `确定要删除任务 "${task.text}" 吗？此操作将从数据库中删除该行。`,
            async () => {
              await props.onDelete(rowId);
              // 从甘特图中删除任务
              gantt.deleteTask(taskId);
            }
          );
        },
      });

      // 显示菜单
      menu.open({
        x: e.clientX,
        y: e.clientY,
      });
    };

    el.value.addEventListener("contextmenu", handleContextMenu);
    
    // 在组件卸载时清理事件监听器
    onBeforeUnmount(() => {
      if (el.value && handleContextMenu) {
        el.value.removeEventListener("contextmenu", handleContextMenu);
      }
    });
  }

  gantt.init(el.value);
  applyTasks();
  
  // 绑定详情按钮点击事件
  bindDetailButtons();
});

// 绑定详情按钮点击事件
function bindDetailButtons() {
  if (!el.value) return;
  
  // 移除旧的事件监听器
  const oldHandler = (el.value as any)._detailClickHandler;
  if (oldHandler) {
    el.value.removeEventListener("click", oldHandler);
  }
  
  // 添加新的事件监听器
  const handleDetailClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const btn = target.closest(".dgrrb-gantt-detail-btn");
    if (!btn) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const rowId = btn.getAttribute("data-row-id");
    if (!rowId) {
      console.warn("[dgrrb] Detail button clicked but no rowId found");
      return;
    }
    
    openDetailDialog(rowId);
  };
  
  el.value.addEventListener("click", handleDetailClick);
  (el.value as any)._detailClickHandler = handleDetailClick;
}

// 打开详情对话框
function openDetailDialog(rowId: string) {
  if (!props.rawData || !props.config?.avID) {
    console.warn("[dgrrb] Cannot open detail dialog: missing rawData or avID");
    return;
  }

  console.info("[dgrrb] Opening detail dialog for rowId:", rowId);
  
  let vueApp: any = null;
  
  const dialog = new Dialog({
    title: "任务详情",
    content: '<div id="dgrrb-detail-container"></div>',
    width: "600px",
    height: "80vh",
    destroyCallback: () => {
      console.info("[dgrrb] Dialog destroyed, unmounting Vue app");
      if (vueApp) {
        vueApp.unmount();
      }
    },
  });

  // 等待 Dialog 渲染完成后再挂载 Vue 组件
  setTimeout(() => {
    // 查找对话框内容区域 - 尝试多种选择器
    let dialogContent = dialog.element.querySelector(".b3-dialog__content");
    if (!dialogContent) {
      dialogContent = dialog.element.querySelector('[class*="dialog"]');
    }
    if (!dialogContent) {
      // 查找包含 id="dgrrb-detail-container" 的元素
      dialogContent = dialog.element.querySelector("#dgrrb-detail-container")?.parentElement || null;
    }
    
    if (!dialogContent) {
      console.error("[dgrrb] Cannot find dialog content area");
      console.error("[dgrrb] Dialog element:", dialog.element);
      console.error("[dgrrb] Dialog element children:", Array.from(dialog.element.children).map(c => ({
        tag: c.tagName,
        class: c.className,
        id: c.id,
      })));
      return;
    }

    // 查找或创建容器
    let container = dialogContent.querySelector("#dgrrb-detail-container") as HTMLElement;
    if (!container) {
      // 如果找不到，创建一个新的
      container = document.createElement("div");
      container.id = "dgrrb-detail-container";
      container.className = "dgrrb-task-detail-dialog-container";
      container.style.cssText = "width: 100%; height: 100%; overflow: hidden;";
      
      // 清空内容区域并添加容器
      dialogContent.innerHTML = "";
      dialogContent.appendChild(container);
    } else {
      // 如果找到了，清空它
      container.innerHTML = "";
      container.className = "dgrrb-task-detail-dialog-container";
      container.style.cssText = "width: 100%; height: 100%; overflow: hidden;";
    }

    console.info("[dgrrb] Creating Vue app for TaskDetailDialog, container:", container);
    
    // 创建 Vue 应用并挂载
    vueApp = createApp(TaskDetailDialog, {
      rowId,
      avID: props.config.avID,
      rawData: props.rawData,
      keyTypeById: props.keyTypeById,
      onSaved: () => {
        // 保存成功后，触发父组件的更新
        if (props.onUpdate) {
          // 可以触发重新加载，或者只更新特定字段
          // 这里我们让父组件处理刷新
          console.info("[dgrrb] Detail dialog saved, parent should reload");
        }
        if (vueApp) {
          vueApp.unmount();
        }
        dialog.destroy();
      },
      onClose: () => {
        if (vueApp) {
          vueApp.unmount();
        }
        dialog.destroy();
      },
    });

    vueApp.mount(container);
    console.info("[dgrrb] Vue app mounted successfully, container children:", container.children.length);
    
    // 检查挂载后的内容
    setTimeout(() => {
      const mountedContent = container.querySelector(".dgrrb-task-detail-dialog");
      console.info("[dgrrb] Mounted content check:", {
        hasContainer: !!container,
        hasMountedContent: !!mountedContent,
        containerChildren: container.children.length,
        containerHTML: container.innerHTML.substring(0, 500),
      });
    }, 100);
  }, 100);
}

watch(
  () => props.tasks,
  () => {
    applyTasks();
    // 在任务更新后重新绑定详情按钮事件
    setTimeout(() => {
      bindDetailButtons();
    }, 100);
  },
  { deep: true },
);

  onBeforeUnmount(() => {
    try {
      ganttEvents.forEach(id => gantt.detachEvent(id));
      ganttEvents.length = 0;
      gantt.clearAll();
    } catch {}
  });
</script>

<style scoped lang="scss">
.dgrrb-gantt-wrap {
  margin-top: 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: var(--b3-border-radius);
  overflow: hidden;
  position: relative;
}

.dgrrb-gantt-debug {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--b3-theme-surface);
  border: 1px solid var(--b3-border-color);
  opacity: 0.85;
}

.dgrrb-gantt {
  width: 100%;
  height: 520px;

  :deep(.dgrrb-gantt-parent-row) {
    background: var(--b3-theme-surface-lighter);
  }

  :deep(.dgrrb-gantt-bold) {
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  :deep(.gantt_tree_icon) {
    opacity: 0.8;
  }

  /* Increase contrast for icons if needed */
  :deep(.gantt_folder_open), :deep(.gantt_folder_closed), :deep(.gantt_file) {
    filter: saturate(1.5) contrast(1.2);
  }

  :deep(.gantt_tree_content) {
    overflow: visible !important;
  }

  /* Make sure branch lines / tree is visible */
  :deep(.gantt_tree_icon) {
    margin-right: 4px;
  }
}
</style>


