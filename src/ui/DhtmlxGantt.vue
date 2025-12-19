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
import { openTab } from "siyuan";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Task } from "@/domain/task";
import { extractId } from "@/domain/task";

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
  onUpdate: (payload: {
    rowId: string;
    start?: string;
    end?: string;
    progress?: number;
    parentId?: string;
  }) => Promise<void> | void;
}>();

const el = ref<HTMLDivElement>();
const isApplying = ref(false);
const lastParsedCount = ref(0);

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
    gantt.parse({ data, tasks: data });
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
        return `<span class="${hasChild ? 'dgrrb-gantt-bold' : ''}">${t.text}</span>`;
      },
    },
    { name: "start_date", label: "开始", align: "center", width: 80 },
    { name: "end_date", label: "结束", align: "center", width: 80 },
    { name: "progress", label: "进度", align: "center", width: 60, template: (t: any) => `${Math.round((t.progress || 0) * 100)}%` },
  ];

  // open doc on double click
  gantt.attachEvent("onTaskDblClick", (id: string | number) => {
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
  });

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
  gantt.attachEvent("onAfterTaskUpdate", async (id: string) => {
    await sync(id);
  });
  gantt.attachEvent("onAfterTaskDrag", async (id: string) => {
    await sync(id);
  });
  gantt.attachEvent("onAfterTaskMove", async (id: string) => {
    await sync(id);
  });

  gantt.init(el.value);
  applyTasks();
});

watch(
  () => props.tasks,
  () => {
    applyTasks();
  },
  { deep: true },
);

onBeforeUnmount(() => {
  try {
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


