<template>
  <div class="dgrrb-taskgantt">
    <div class="dgrrb-taskgantt__header">
      <div class="dgrrb-taskgantt__title">
        <span v-if="configStore.dbName">{{ configStore.dbName }}</span>
        <span v-else>任务甘特（AV）</span>
      </div>
      <div class="dgrrb-taskgantt__actions">
        <button class="b3-button b3-button--primary" type="button" @click="reload">刷新</button>
      </div>
    </div>

    <div v-if="uiStore.error" class="b3-chip b3-chip--error">{{ uiStore.error }}</div>

    <div v-if="!configStore.currentConfig?.avID" class="b3-chip">
      未配置 avID：请在插件设置中填写"任务数据库（AV）配置"
    </div>

    <div v-if="uiStore.loading" class="b3-chip">加载中…</div>

    <template v-if="configStore.currentConfig?.avID && !uiStore.loading">
      <div class="dgrrb-taskgantt__meta">
        <div class="b3-chip">avID: {{ configStore.currentConfig.avID }}</div>
        <div class="b3-chip" v-if="configStore.currentConfig.viewID">viewID: {{ configStore.currentConfig.viewID }}</div>
        <div class="b3-chip" v-if="rowCount !== null">行数: {{ rowCount }}</div>
      </div>

      <div class="dgrrb-taskgantt__filters" v-if="configStore.currentConfig.statusKeyID || configStore.currentConfig.typeKeyID || configStore.currentConfig.projectKeyID">
        <div class="dgrrb-taskgantt__filterField" v-if="configStore.currentConfig.statusKeyID">
          <label class="dgrrb-taskgantt__filterLabel">状态</label>
          <select v-model="filterStore.filterStatus" class="b3-select">
            <option value="">全部</option>
            <option v-for="option in getFilterOptions(configStore.currentConfig.statusKeyID)" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </div>
        <div class="dgrrb-taskgantt__filterField" v-if="configStore.currentConfig.typeKeyID">
          <label class="dgrrb-taskgantt__filterLabel">类型</label>
          <select v-model="filterStore.filterType" class="b3-select">
            <option value="">全部</option>
            <option v-for="option in getFilterOptions(configStore.currentConfig.typeKeyID)" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </div>
        <div class="dgrrb-taskgantt__filterField" v-if="configStore.currentConfig.projectKeyID">
          <label class="dgrrb-taskgantt__filterLabel">项目</label>
          <select v-model="filterStore.filterProject" class="b3-select">
            <option value="">全部</option>
            <option v-for="option in getFilterOptions(configStore.currentConfig.projectKeyID)" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </div>
      </div>

      <DhtmlxGantt
        v-if="filteredTasks.length"
        :plugin="props.plugin"
        :tasks="filteredTasks"
        :key-type-by-id="taskStore.keyTypeById"
        :config="configStore.currentConfig!"
        :raw-data="taskStore.rawData"
        :on-update="onGanttUpdate"
        :on-create="onGanttCreate"
        :on-create-outcome="onGanttCreateOutcome"
        :on-delete="onGanttDelete"
        :on-detail-saved="reload"
        :on-update-fields="onUpdateFields"
      />

      <div class="dgrrb-taskgantt__report">
        <div class="dgrrb-taskgantt__reportHeader">
          <div class="dgrrb-taskgantt__reportTitle">日报/月报汇总</div>
          <div class="dgrrb-taskgantt__actions">
            <button class="b3-button b3-button--primary" type="button" @click="generateReport">生成汇总</button>
            <button class="b3-button b3-button--primary" type="button" @click="copyReport" :disabled="!reportStore.reportMd">复制</button>
          </div>
        </div>

        <div class="dgrrb-taskgantt__reportRange">
          <div class="dgrrb-taskgantt__reportField">
            <div class="dgrrb-taskgantt__reportLabel">从</div>
            <input class="b3-text-field" type="date" v-model="reportStore.reportFrom" />
          </div>
          <div class="dgrrb-taskgantt__reportField">
            <div class="dgrrb-taskgantt__reportLabel">到</div>
            <input class="b3-text-field" type="date" v-model="reportStore.reportTo" />
          </div>
        </div>

        <pre v-if="reportStore.reportMd" class="b3-typography dgrrb-taskgantt__reportBody">{{ reportStore.reportMd }}</pre>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Plugin } from "siyuan";
import { showMessage } from "siyuan";
import { computed, onMounted, onActivated, onDeactivated } from "vue";
import { useTaskStore } from "@/stores/taskStore";
import { useConfigStore } from "@/stores/configStore";
import { useFilterStore } from "@/stores/filterStore";
import { useReportStore } from "@/stores/reportStore";
import { useUiStore } from "@/stores/uiStore";
import { valueToText } from "@/domain/task";
import DhtmlxGantt from "@/ui/DhtmlxGantt.vue";

const props = defineProps<{
  plugin: Plugin;
  dbId?: string;
}>();

// 使用 store
const taskStore = useTaskStore();
const configStore = useConfigStore();
const filterStore = useFilterStore();
const reportStore = useReportStore();
const uiStore = useUiStore();

// 初始化 store
configStore.init(props.plugin);

const rowCount = computed(() => {
  return taskStore.tableData.rows.length;
});

// 获取筛选器的可选项
function getFilterOptions(keyID: string | undefined): string[] {
  if (!keyID) return [];

  // 首先尝试从 keysById 中获取 key 定义和 options
  const keyDef = taskStore.keysById[keyID];

  if (keyDef?.options && Array.isArray(keyDef.options)) {
    return keyDef.options.map((opt: any) => {
      if (typeof opt === "string") return opt;
      return opt.name || opt.content || "";
    }).filter(Boolean);
  }

  // 如果没有 options，从 tableData 中提取所有已使用的值
  const values = new Set<string>();
  for (const row of taskStore.tableData.rows) {
    const cell = row.cells[keyID];
    if (cell?.value !== undefined && cell.value !== null) {
      const text = cell.text || valueToText(cell.value);
      if (text) {
        values.add(text);
      }
    }
  }
  return Array.from(values).sort();
}

// 筛选后的任务列表（转换为 Task 格式供甘特图使用）
const filteredTasks = computed(() => {
  const filteredRows = taskStore.getFilteredRows;
  const config = configStore.currentConfig;
  if (!config) return [];

  return filteredRows.map(row => {
    const startCell = config.startKeyID ? row.cells[config.startKeyID] : undefined;
    const endCell = config.endKeyID ? row.cells[config.endKeyID] : undefined;
    const statusCell = config.statusKeyID ? row.cells[config.statusKeyID] : undefined;
    const progressCell = config.progressKeyID ? row.cells[config.progressKeyID] : undefined;
    const parentCell = config.parentKeyID ? row.cells[config.parentKeyID] : undefined;

    // 提取日期
    const normalizeDate = (v: any): string | undefined => {
      if (!v) return undefined;
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v))
        return v;
      if (typeof v === "object" && v.date?.content) {
        const d = new Date(v.date.content);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      }
      return undefined;
    };

    // 提取数字
    const valueToNumber = (v: any): number | undefined => {
      if (v === undefined || v === null) return undefined;
      if (typeof v === "number") return v;
      if (typeof v === "object" && v.number?.content !== undefined) return v.number.content;
      return undefined;
    };

    // 提取 ID
    const extractId = (v: any): string => {
      const s = valueToText(v).trim();
      if (!s) return "";
      const match = s.match(/^\(\(([a-zA-Z0-9-]+)(?:\s+"[^"]*")?\)\)$/) || s.match(/^\[\[([a-zA-Z0-9-]+)\]\]$/);
      return match ? match[1] : s;
    };

    // 提取标题（从 block 类型字段）
    const blockColumn = taskStore.tableData.columns.find(c => c.type === "block");
    const titleCell = blockColumn ? row.cells[blockColumn.keyID] : undefined;
    const title = titleCell?.text || row.itemID;

    return {
      docId: row.itemID,
      blockId: row.blockId,
      title,
      start: normalizeDate(startCell?.value),
      end: normalizeDate(endCell?.value),
      status: statusCell?.text,
      progress: valueToNumber(progressCell?.value),
      parentId: parentCell ? extractId(parentCell.value) : undefined,
      cells: row.cells,
    };
  });
});

async function reload() {
  uiStore.clearError();
  await configStore.loadConfig(props.dbId);
  const config = configStore.currentConfig;
  if (!config?.avID)
    return;

  await taskStore.loadTasks(config.avID, config.viewID);
}

async function onGanttUpdate(payload: { itemID: string; start?: string; end?: string; progress?: number; parentId?: string }) {
  await taskStore.updateTaskFields(payload.itemID, payload);
}

async function onGanttDelete(itemID: string) {
  await taskStore.deleteTask(itemID);
}

async function onGanttCreate(payload: { text: string; parent?: string; start_date: Date; duration: number }): Promise<string> {
  return await taskStore.createTask(payload);
}

async function onGanttCreateOutcome(payload: {
  text: string;
  parent?: string;
  start_date: Date;
  duration: number;
  fields?: Record<string, any>;
}): Promise<string> {
  return await taskStore.createOutcome(payload);
}

async function onUpdateFields(itemID: string, updates: Record<string, any>) {
  await taskStore.updateFields(itemID, updates);
}

function generateReport() {
  reportStore.generateReport();
}

async function copyReport() {
  const success = await reportStore.copyReport();
  if (success) {
    showMessage("已复制到剪贴板", 3000, "info");
  } else {
    showMessage("复制失败（可能是环境限制）", 6000, "error");
  }
}

// Expose reload method for tab update callback
defineExpose({
  reload,
});

onMounted(() => {
  console.log("[dgrrb] TaskGanttApp mounted, dbId:", props.dbId);
  void reload();
});

// Handle tab activation (when switching back to this tab)
onActivated(() => {
  console.log("[dgrrb] TaskGanttApp activated, reloading...");
  void reload();
});

// Optional: handle deactivation
onDeactivated(() => {
  console.log("[dgrrb] TaskGanttApp deactivated");
});
</script>

<style scoped lang="scss">
.dgrrb-taskgantt {
  padding: 12px;
  box-sizing: border-box;
  height: 100%;
  overflow: auto;
}

.dgrrb-taskgantt__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.dgrrb-taskgantt__title {
  font-size: 14px;
  font-weight: 600;
}

.dgrrb-taskgantt__actions {
  display: flex;
  gap: 8px;
}

.dgrrb-taskgantt__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.dgrrb-taskgantt__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  align-items: center;
}

.dgrrb-taskgantt__filterField {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dgrrb-taskgantt__filterLabel {
  min-width: 40px;
  font-size: 12px;
  opacity: 0.8;
}

.dgrrb-taskgantt__report {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--b3-border-color);
}

.dgrrb-taskgantt__reportHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.dgrrb-taskgantt__reportTitle {
  font-weight: 600;
}

.dgrrb-taskgantt__reportRange {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.dgrrb-taskgantt__reportField {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dgrrb-taskgantt__reportLabel {
  min-width: 24px;
  opacity: 0.8;
}

.dgrrb-taskgantt__reportBody {
  margin-top: 8px;
  white-space: pre-wrap;
}

pre {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
