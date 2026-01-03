<template>
  <div class="dgrrb-taskgantt">
    <div class="dgrrb-taskgantt__header">
      <div class="dgrrb-taskgantt__title">
        <span v-if="dbName">{{ dbName }}</span>
        <span v-else>任务甘特（AV）</span>
      </div>
      <div class="dgrrb-taskgantt__actions">
        <button class="b3-button b3-button--primary" type="button" @click="reload">刷新</button>
      </div>
    </div>

    <div v-if="error" class="b3-chip b3-chip--error">{{ error }}</div>

    <div v-if="!config?.avID" class="b3-chip">
      未配置 avID：请在插件设置中填写“任务数据库（AV）配置”
    </div>

    <div v-if="loading" class="b3-chip">加载中…</div>

    <template v-if="config?.avID && !loading">
      <div class="dgrrb-taskgantt__meta">
        <div class="b3-chip">avID: {{ config.avID }}</div>
        <div class="b3-chip" v-if="config.viewID">viewID: {{ config.viewID }}</div>
        <div class="b3-chip" v-if="rowCount !== null">行数: {{ rowCount }}</div>
      </div>

      <div class="dgrrb-taskgantt__filters" v-if="config.statusKeyID || config.typeKeyID || config.projectKeyID">
        <div class="dgrrb-taskgantt__filterField" v-if="config.statusKeyID">
          <label class="dgrrb-taskgantt__filterLabel">状态</label>
          <select v-model="filterStatus" class="b3-select">
            <option value="">全部</option>
            <option v-for="option in getFilterOptions(config.statusKeyID)" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </div>
        <div class="dgrrb-taskgantt__filterField" v-if="config.typeKeyID">
          <label class="dgrrb-taskgantt__filterLabel">类型</label>
          <select v-model="filterType" class="b3-select">
            <option value="">全部</option>
            <option v-for="option in getFilterOptions(config.typeKeyID)" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </div>
        <div class="dgrrb-taskgantt__filterField" v-if="config.projectKeyID">
          <label class="dgrrb-taskgantt__filterLabel">项目</label>
          <select v-model="filterProject" class="b3-select">
            <option value="">全部</option>
            <option v-for="option in getFilterOptions(config.projectKeyID)" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </div>
      </div>

      <DhtmlxGantt
        v-if="filteredTasks.length"
        :plugin="props.plugin"
        :tasks="filteredTasks"
        :key-type-by-id="keyTypeById"
        :config="config!"
        :raw-data="raw"
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
            <button class="b3-button b3-button--primary" type="button" @click="copyReport" :disabled="!reportMd">复制</button>
          </div>
        </div>

        <div class="dgrrb-taskgantt__reportRange">
          <div class="dgrrb-taskgantt__reportField">
            <div class="dgrrb-taskgantt__reportLabel">从</div>
            <input class="b3-text-field" type="date" v-model="reportFrom" />
          </div>
          <div class="dgrrb-taskgantt__reportField">
            <div class="dgrrb-taskgantt__reportLabel">到</div>
            <input class="b3-text-field" type="date" v-model="reportTo" />
          </div>
        </div>

        <pre v-if="reportMd" class="b3-typography dgrrb-taskgantt__reportBody">{{ reportMd }}</pre>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Plugin } from "siyuan";
import { showMessage } from "siyuan";
import { computed, onMounted, onActivated, ref, onDeactivated } from "vue";
import {
  addAttributeViewBlocks,
  appendAttributeViewDetachedBlocksWithValues,
  appendBlock,
  batchSetAttributeViewBlockAttrs,
  getAttributeViewKeysByAvID,
  getBlockByID,
  removeAttributeViewBlocks,
  renderAttributeView,
} from "@/api";
import { parseRenderAttributeViewToTasks, type Task, type TaskAvConfig, valueToText } from "@/domain/task";
import { buildValue } from "@/utils";
import { nanoid } from "nanoid";
import DhtmlxGantt from "@/ui/DhtmlxGantt.vue";

const props = defineProps<{
  plugin: Plugin;
  dbId?: string;
}>();

const loading = ref(false);
const error = ref<string>("");
const config = ref<TaskAvConfig | null>(null);
const raw = ref<any>(null);
const tasks = ref<Task[]>([]);
const keyTypeById = ref<Record<string, string>>({});
const keysById = ref<Record<string, any>>({});
const reportFrom = ref(new Date().toISOString().slice(0, 10));
const reportTo = ref(new Date().toISOString().slice(0, 10));
const reportMd = ref("");
const dbName = ref<string>("");

// 筛选状态
const filterStatus = ref("进行中");
const filterType = ref("任务");
const filterProject = ref("");

function toArray(maybeArr: any): any[] {
  if (Array.isArray(maybeArr))
    return maybeArr;
  if (maybeArr && typeof maybeArr === "object")
    return Object.values(maybeArr);
  return [];
}

function normalizeAvKeys(res: any): any[] {
  // possible shapes across versions:
  // - data: { keys: [...] }  -> our wrapper returns { keys: [...] }
  // - data: [...]            -> our wrapper returns [...]
  // - data: { keys: {..} }   -> object map
  const direct = res?.keys ?? res?.data?.keys ?? res?.data ?? res;
  const arr = toArray(direct);
  if (arr.length)
    return arr;

  // Deep search fallback: find the first array that looks like AV keys
  const seen = new Set<any>();
  const queue: any[] = [res];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || seen.has(cur))
      continue;
    seen.add(cur);
    if (Array.isArray(cur)) {
      if (cur.length && cur.every((x: any) => x && typeof x === "object" && "id" in x && "type" in x))
        return cur;
      for (const it of cur)
        queue.push(it);
    } else if (typeof cur === "object") {
      for (const v of Object.values(cur))
        queue.push(v);
    }
  }
  return [];
}

const rowCount = computed(() => {
  const view = raw.value?.view;
  const rows = view?.rows || view?.rowIDs || null;
  if (Array.isArray(rows))
    return rows.length;
  if (Array.isArray(view?.rows))
    return view.rows.length;
  return null;
});

// 获取筛选器的可选项
function getFilterOptions(keyID: string | undefined): string[] {
  if (!keyID) return [];
  
  // 首先尝试从 keysById 中获取 key 定义和 options
  const keyDef = keysById.value[keyID];
  
  if (keyDef?.options && Array.isArray(keyDef.options)) {
    return keyDef.options.map((opt: any) => {
      if (typeof opt === "string") return opt;
      return opt.name || opt.content || "";
    }).filter(Boolean);
  }
  
  // 如果没有 options，从 tasks 中提取所有已使用的值
  const values = new Set<string>();
  for (const task of tasks.value) {
    const cell = task.cells[keyID];
    if (cell?.value !== undefined && cell.value !== null) {
      const text = valueToText(cell.value);
      if (text) {
        values.add(text);
      }
    }
  }
  return Array.from(values).sort();
}

// 筛选后的任务列表
const filteredTasks = computed(() => {
  if (!config.value) return tasks.value;
  
  return tasks.value.filter((task) => {
    // 状态筛选
    if (filterStatus.value && config.value.statusKeyID) {
      const statusCell = task.cells[config.value.statusKeyID];
      const statusText = statusCell?.value ? valueToText(statusCell.value) : "";
      if (statusText !== filterStatus.value) {
        return false;
      }
    }
    
    // 类型筛选
    if (filterType.value && config.value.typeKeyID) {
      const typeCell = task.cells[config.value.typeKeyID];
      const typeText = typeCell?.value ? valueToText(typeCell.value) : "";
      if (typeText !== filterType.value) {
        return false;
      }
    }
    
    // 项目筛选
    if (filterProject.value && config.value.projectKeyID) {
      const projectCell = task.cells[config.value.projectKeyID];
      const projectText = projectCell?.value ? valueToText(projectCell.value) : "";
      if (projectText !== filterProject.value) {
        return false;
      }
    }
    
    return true;
  });
});

async function loadConfig() {
  console.log("[dgrrb] loadConfig called, dbId:", props.dbId);
  if (props.dbId) {
    // Load from database configs
    const configs = await props.plugin.loadData("task-av-configs").catch(() => null) as Array<{ id: string; name: string; config: TaskAvConfig }> | null;
    console.log("[dgrrb] Loaded configs:", configs);
    const db = configs?.find(c => c.id === props.dbId);
    if (db) {
      config.value = db.config;
      dbName.value = db.name;
      console.log("[dgrrb] Found database config:", db);
      return;
    } else {
      console.warn("[dgrrb] Database not found for dbId:", props.dbId);
    }
  }
  // Fallback to old config (for backward compatibility)
  const saved = await props.plugin.loadData("task-av-config").catch(() => null) as TaskAvConfig | null;
  config.value = saved;
  dbName.value = "";
  console.log("[dgrrb] Using fallback config:", saved);
}

async function reload() {
  error.value = "";
  raw.value = null;
  tasks.value = [];
  await loadConfig();
  if (!config.value?.avID)
    return;
  loading.value = true;
  try {
    const keys = await getAttributeViewKeysByAvID(config.value.avID);
    const keyArr = normalizeAvKeys(keys);
    keyTypeById.value = Object.fromEntries(
      keyArr.map((k: any) => [k.id, k.type]),
    );
    keysById.value = Object.fromEntries(
      keyArr.map((k: any) => [k.id, k]),
    );

    raw.value = await renderAttributeView(config.value.avID, {
      viewID: config.value.viewID || undefined,
      page: 1,
      pageSize: -1,
    });
    tasks.value = parseRenderAttributeViewToTasks(raw.value, config.value);
  } catch (e: any) {
    console.error(e);
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function batchUpdateCells(
  itemID: string,
  updates: Array<{ keyID: string; value: any; keyType?: string }>,
  options?: { reloadAfter?: boolean }
): Promise<boolean> {
  if (!config.value?.avID || updates.length === 0)
    return false;

  try {
    // 构建批量请求的 values 数组
    const values = updates.map(({ keyID, value, keyType }) => {
      const actualKeyType = keyType || keyTypeById.value[keyID];
      // 对于关系类型，使用第一种格式（如果失败会在外层重试其他格式）
      // 对于其他类型，使用 buildValue 构建
      const finalValue = actualKeyType === "relation" && value
        ? { relation: [{ content: String(value) }] }
        : buildValue(actualKeyType, value);

      return {
        keyID,
        itemID, // itemID 必须是 row.id (docId)，不是 block.id
        value: finalValue,
      };
    });

    console.info(`[dgrrb] batchUpdateCells: itemID=${itemID}, updates=${updates.length}`, values);
    const resp = await batchSetAttributeViewBlockAttrs(config.value.avID, values);

    if (resp && resp.code !== 0) {
      console.error(`[dgrrb] batchUpdateCells failed:`, resp);

      // 对于关系类型字段，如果批量接口失败，尝试多种格式
      const relationUpdates = updates.filter((u) => {
        const keyType = u.keyType || keyTypeById.value[u.keyID];
        return keyType === "relation" && u.value;
      });

      if (relationUpdates.length > 0) {
        console.info(`[dgrrb] batchUpdateCells: retrying relation fields with alternative formats...`);
        // 尝试其他关系格式
        const relationTries = [
          { relation: [{ content: String(relationUpdates[0].value) }] },
          { relation: [{ id: String(relationUpdates[0].value) }] },
          { relation: { blockIDs: [String(relationUpdates[0].value)] } },
        ];

        for (const relationValue of relationTries) {
          const retryValues = values.map((v) => {
            const update = updates.find((u) => u.keyID === v.keyID);
            if (update && (update.keyType || keyTypeById.value[update.keyID]) === "relation") {
              return { ...v, value: relationValue };
            }
            return v;
          });

          const retryResp = await batchSetAttributeViewBlockAttrs(config.value.avID, retryValues);
          if (retryResp.code === 0) {
            console.info(`[dgrrb] batchUpdateCells: retry succeeded with format:`, relationValue);
            if (options?.reloadAfter !== false)
              await reload();
            return true;
          }
        }
      }

      showMessage("批量更新失败", 8000, "error");
      return false;
    }

    console.info(`[dgrrb] batchUpdateCells success`);
    if (options?.reloadAfter !== false)
      await reload();
    return true;
  } catch (e: any) {
    console.error(`[dgrrb] batchUpdateCells error:`, e);
    showMessage(`批量更新失败: ${e.message || String(e)}`, 8000, "error");
    return false;
  }
}

async function onGanttUpdate(payload: { itemID: string; start?: string; end?: string; progress?: number; parentId?: string }) {
  if (!config.value?.avID)
    return;

  // 收集所有需要更新的字段
  const updates: Array<{ keyID: string; value: any; keyType?: string }> = [];

  if (config.value.startKeyID && payload.start !== undefined) {
    updates.push({
      keyID: config.value.startKeyID,
      value: payload.start,
      keyType: keyTypeById.value[config.value.startKeyID],
    });
  }

  if (config.value.endKeyID && payload.end !== undefined) {
    updates.push({
      keyID: config.value.endKeyID,
      value: payload.end,
      keyType: keyTypeById.value[config.value.endKeyID],
    });
  }

  if (config.value.progressKeyID && payload.progress !== undefined) {
    updates.push({
      keyID: config.value.progressKeyID,
      value: payload.progress,
      keyType: keyTypeById.value[config.value.progressKeyID],
    });
  }

  if (config.value.parentKeyID !== undefined && payload.parentId !== undefined) {
    const parentKeyType = keyTypeById.value[config.value.parentKeyID];
    updates.push({
      keyID: config.value.parentKeyID,
      value: payload.parentId,
      keyType: parentKeyType,
    });
  }

  // 使用批量接口一次性更新所有字段
  if (updates.length > 0) {
    await batchUpdateCells(payload.itemID, updates, { reloadAfter: true });
  } else {
    await reload();
  }
}

async function onGanttDelete(itemID: string) {
  console.info("[dgrrb] onGanttDelete starting:", itemID);
  if (!config.value?.avID)
    return;

  try {
    // 从数据库中删除该行
    await removeAttributeViewBlocks(config.value.avID, [itemID]);

    // 刷新数据
    await reload();
    showMessage("删除任务成功", 2000, "info");
  } catch (e: any) {
    console.error("[dgrrb] onGanttDelete error:", e);
    showMessage(`删除失败: ${e.message || String(e)}`, 8000, "error");
  }
}

function toYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function onGanttCreate(payload: { text: string; parent?: string; start_date: Date; duration: number }): Promise<string> {
  console.info("[dgrrb] onGanttCreate starting:", payload);
  if (!config.value?.avID)
    throw new Error("未配置 avID");

  let parentID: string | undefined;
  if (payload.parent) {
    // 如果 parent 是甘特图 ID，需要转换为 rowId
    const task = tasks.value.find(t => String(t.blockId || t.docId) === payload.parent);
    if (task) {
      parentID = task.blockId || task.docId;
    } else {
      parentID = payload.parent;
    }
  } else {
    parentID = payload.parent;
  }
  
  // 如果没有指定父任务，使用第一个任务作为参考
  if (!parentID) {
    const refTask = tasks.value[0];
    if (refTask) {
      const blockNode = await getBlockByID(refTask.blockId || refTask.docId);
      parentID = blockNode?.parent_id || refTask.docId;
    } else {
      throw new Error("无法创建任务：视图为空，请先手动在数据库添加一行作为定位参考");
    }
  }

  if (!parentID)
    throw new Error("无法确定父任务位置");

  try {
    const res = await appendBlock("markdown", payload.text || "新任务", parentID);
    if (!res || res.length === 0) {
      throw new Error("思源：创建块失败");
    }
    const newBlockID = (res as any)[0]?.doOperations?.[0]?.id || (res as any)[0]?.id;
    if (!newBlockID) {
      throw new Error("思源：未能获取新块 ID");
    }
    
    // 生成 itemID（思源格式：时间戳-随机字符串）
    const itemID = `${Date.now()}-${nanoid()}`;
    
    // 3. Add this block to the Attribute View with specified itemID
    console.info(`[dgrrb] adding block ${newBlockID} to AV ${config.value.avID} with itemID ${itemID}...`);
    await addAttributeViewBlocks(config.value.avID, [{ id: newBlockID, isDetached: false, itemID }]);

    // 4. Polling for the new row to appear in the AV
    let found = false;
    for (let i = 0; i < 10; i++) {
        await reload();
        const foundTask = tasks.value.find(t => t.docId === itemID || t.docId === newBlockID || t.blockId === newBlockID);
        if (foundTask) {
            found = true;
            console.info(`[dgrrb] new row ${itemID} discovered. Available Cells:`, Object.keys(foundTask.cells || {}));
            break;
        }
        console.info(`[dgrrb] waiting for row ${itemID} to appear in AV (${i + 1}/10)...`);
        await new Promise(r => setTimeout(r, 600));
    }

    if (!found) {
        console.warn(`[dgrrb] row ${itemID} added but didn't appear in AV within timeout. Attributes might fail to sync.`);
    }

    // 5. Sync attributes (Dates, Parent)
    const start = toYmd(payload.start_date);
    const end = toYmd(new Date(payload.start_date.getTime() + (payload.duration - 1) * 24 * 60 * 60 * 1000));

    console.info(`[dgrrb] triggering attribute sync for itemID ${itemID}. Parent: ${payload.parent || "none"}`);
    await onGanttUpdate({
        itemID: itemID,
        start,
        end,
        parentId: payload.parent || "",
    });

    return itemID;

  } catch (e: any) {
    console.error(e);
    showMessage(`创建失败: ${e.message || String(e)}`, 8000, "error");
    throw e;
  }
}

async function onGanttCreateOutcome(payload: {
  text: string;
  parent?: string;
  start_date: Date;
  duration: number;
  fields?: Record<string, any>;
}): Promise<string> {
  if (!config.value?.avID) {
    throw new Error("数据库配置缺失");
  }

  try {
    // 1. 生成 itemID（思源格式：时间戳-随机字符串）
    const itemID = `${Date.now()}-${nanoid()}`;
    
    console.info(`[dgrrb] creating outcome with itemID ${itemID}...`);
    
    // 2. 构建 blocksValues（二维数组，一行数据）
    const blocksValues: Array<Array<{ keyID: string; [key: string]: any }>> = [[]];
    
    // 添加所有字段的值
    if (payload.fields) {
      for (const [keyID, value] of Object.entries(payload.fields)) {
        const keyType = keyTypeById.value[keyID];
        if (keyType) {
          // 对于成果，日期时间支持时分（isNotTime: false）
          const isNotTime = keyType !== "date" ? true : false;
          const valueObj = buildValue(keyType, value, isNotTime);
          blocksValues[0].push({
            keyID,
            ...valueObj,
          });
        }
      }
    }
    
    // 3. 调用 API 创建非绑定块
    console.info(`[dgrrb] calling appendAttributeViewDetachedBlocksWithValues for AV ${config.value.avID}...`);
    await appendAttributeViewDetachedBlocksWithValues(config.value.avID, blocksValues);
    
    // 4. 刷新页面
    await reload();
    
    return itemID;
    
  } catch (e: any) {
    console.error(e);
    showMessage(`创建成果失败: ${e.message || String(e)}`, 8000, "error");
    throw e;
  }
}

async function onUpdateFields(itemID: string, updates: Record<string, any>) {
  console.info("[dgrrb] onUpdateFields called", itemID, updates);
  if (!config.value?.avID) {
    return;
  }

  try {
    // 构建批量请求的 values 数组
    const values = Object.entries(updates).map(([keyID, value]) => ({
      keyID,
      itemID,
      value,
    }));

    if (values.length === 0) {
      return;
    }

    console.info(`[dgrrb] onUpdateFields: updating ${values.length} fields for itemID ${itemID}`);
    const resp = await batchSetAttributeViewBlockAttrs(config.value.avID, values);

    if (resp && resp.code !== 0) {
      console.error(`[dgrrb] onUpdateFields failed:`, resp);
      showMessage("更新字段失败", 5000, "error");
      return;
    }

    console.info(`[dgrrb] onUpdateFields success`);
    // 刷新数据
    await reload();
  } catch (e: any) {
    console.error(`[dgrrb] onUpdateFields error:`, e);
    showMessage(`更新字段失败: ${e.message || String(e)}`, 5000, "error");
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

function isDoneStatus(s?: string) {
  if (!s)
    return false;
  return /done|完成|已完成|finished/i.test(s);
}

function generateReport() {
  const from = reportFrom.value;
  const to = reportTo.value;
  const done: Task[] = [];
  const pending: Task[] = [];

  // 当前实现：按状态粗分；日期范围暂用于标题/筛选（若任务 start/end 在范围内则纳入）
  const inRange = (t: Task) => {
    if (!from || !to)
      return true;
    const s = t.start || "0000-00-00";
    const e = t.end || "9999-12-31";
    return !(e < from || s > to);
  };

  for (const t of tasks.value) {
    if (!inRange(t))
      continue;
    (isDoneStatus(t.status) ? done : pending).push(t);
  }

  const lines: string[] = [];
  lines.push(`# 汇总 ${from || ""} ~ ${to || ""}`.trim());
  lines.push("");
  lines.push("## 已完成");
  if (done.length === 0)
    lines.push("- （无）");
  else
    done.forEach(t => lines.push(`- ${t.title} (${t.docId})`));
  lines.push("");
  lines.push("## 进行中/未完成");
  if (pending.length === 0)
    lines.push("- （无）");
  else
    pending.forEach(t => lines.push(`- ${t.title} (${t.docId})`));

  reportMd.value = lines.join("\n");
}

async function copyReport() {
  if (!reportMd.value)
    return;
  try {
    await navigator.clipboard.writeText(reportMd.value);
    showMessage("已复制到剪贴板", 3000, "info");
  } catch (e) {
    console.warn(e);
    showMessage("复制失败（可能是环境限制）", 6000, "error");
  }
}
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


