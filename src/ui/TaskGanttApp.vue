<template>
  <div class="dgrrb-taskgantt">
    <div class="dgrrb-taskgantt__header">
      <div class="dgrrb-taskgantt__title">
        <span v-if="dbName">{{ dbName }}</span>
        <span v-else>任务甘特（AV）</span>
      </div>
      <div class="dgrrb-taskgantt__actions">
        <button class="b3-button b3-button--small" type="button" @click="reload">刷新</button>
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

      <div v-if="tasks.length" class="dgrrb-taskgantt__tableWrap">
        <table class="b3-table">
          <thead>
            <tr>
              <th>任务</th>
              <th v-if="config.parentKeyID">父任务</th>
              <th v-if="config.startKeyID">开始</th>
              <th v-if="config.endKeyID">结束</th>
              <th v-if="config.statusKeyID">状态</th>
              <th v-if="config.progressKeyID">进度</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="it in displayTasks" :key="it.task.docId">
              <td>
                <div class="dgrrb-taskgantt__titleCell">
                  <div class="dgrrb-taskgantt__titleText">
                    <span class="dgrrb-taskgantt__indent" :style="{ width: `${it.depth * 16}px` }" />
                    {{ it.task.title }}
                  </div>
                  <div class="dgrrb-taskgantt__idText">
                    rowID: {{ it.task.docId }}<span v-if="it.task.blockId"> · blockID: {{ it.task.blockId }}</span>
                  </div>
                </div>
              </td>

              <td v-if="config.parentKeyID">
                <input
                  class="b3-text-field"
                  :value="it.task.parentId || ''"
                  placeholder="父任务（建议填 blockID）"
                  @change="(e) => updateRelation(it.task.docId, config!.parentKeyID!, (e.target as HTMLInputElement).value)"
                />
              </td>

              <td v-if="config.startKeyID">
                <input
                  class="b3-text-field"
                  type="date"
                  :value="it.task.start || ''"
                  @change="(e) => updateCell(it.task.docId, config!.startKeyID!, (e.target as HTMLInputElement).value)"
                />
              </td>

              <td v-if="config.endKeyID">
                <input
                  class="b3-text-field"
                  type="date"
                  :value="it.task.end || ''"
                  @change="(e) => updateCell(it.task.docId, config!.endKeyID!, (e.target as HTMLInputElement).value)"
                />
              </td>

              <td v-if="config.statusKeyID">
                <input
                  class="b3-text-field"
                  :value="it.task.status || ''"
                  placeholder="输入状态（mSelect 单选）"
                  @change="(e) => updateCell(it.task.docId, config!.statusKeyID!, (e.target as HTMLInputElement).value)"
                />
              </td>

              <td v-if="config.progressKeyID">
                <input
                  class="b3-text-field"
                  type="number"
                  min="0"
                  max="100"
                  :value="it.task.progress ?? ''"
                  @change="(e) => updateCell(it.task.docId, config!.progressKeyID!, (e.target as HTMLInputElement).value)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <DhtmlxGantt
        v-if="tasks.length"
        :plugin="props.plugin"
        :tasks="tasks"
        :key-type-by-id="keyTypeById"
        :config="config!"
        :on-update="onGanttUpdate"
        :on-create="onGanttCreate"
        :on-delete="onGanttDelete"
      />

      <div class="dgrrb-taskgantt__report">
        <div class="dgrrb-taskgantt__reportHeader">
          <div class="dgrrb-taskgantt__reportTitle">日报/月报汇总</div>
          <div class="dgrrb-taskgantt__actions">
            <button class="b3-button b3-button--small" type="button" @click="generateReport">生成汇总</button>
            <button class="b3-button b3-button--small" type="button" @click="copyReport" :disabled="!reportMd">复制</button>
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

      <details v-if="raw" class="dgrrb-taskgantt__raw">
        <summary class="b3-chip">展开原始 renderAttributeView 响应（调试）</summary>
        <pre class="b3-typography">{{ JSON.stringify(raw, null, 2) }}</pre>
      </details>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Plugin } from "siyuan";
import { showMessage } from "siyuan";
import { computed, onMounted, ref } from "vue";
import {
  addAttributeViewBlocks,
  appendBlock,
  batchSetAttributeViewBlockAttrs,
  getAttributeViewKeysByAvID,
  getAttributeViewKeysOfBlock,
  getBlockByID,
  removeAttributeViewBlocks,
  renderAttributeView,
  requestRaw,
  setAttributeViewBlockAttr,
} from "@/api";
import { parseRenderAttributeViewToTasks, type Task, type TaskAvConfig } from "@/domain/task";
import DhtmlxGantt from "@/ui/DhtmlxGantt.vue";

const props = defineProps<{
  plugin: Plugin;
  dbId?: string;
}>();

type TaskAvConfig = {
  avID: string;
  viewID?: string;
  startKeyID?: string;
  endKeyID?: string;
  statusKeyID?: string;
  parentKeyID?: string;
  progressKeyID?: string;
};

const loading = ref(false);
const error = ref<string>("");
const config = ref<TaskAvConfig | null>(null);
const raw = ref<any>(null);
const tasks = ref<Task[]>([]);
const keyTypeById = ref<Record<string, string>>({});
const reportFrom = ref(new Date().toISOString().slice(0, 10));
const reportTo = ref(new Date().toISOString().slice(0, 10));
const reportMd = ref("");
const dbName = ref<string>("");

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

async function ensureCellId(rowId: string, avID: string, keyID: string, retry = 3): Promise<string | undefined> {
  // first: from parsed tasks cache
  const t = tasks.value.find(x => x.docId === rowId);
  const cached = t?.cells?.[keyID]?.cellID;
  if (cached)
    return cached;
  
  console.info(`[dgrrb] ensureCellId: cache miss for row ${rowId} key ${keyID}. Task cells keys: ${Object.keys(t?.cells || {}).join(",")}`);

  // fallback: query by block id (docId)
  for (let i = 0; i < retry; i++) {
    const res = await getAttributeViewKeysOfBlock(rowId);
    const list = res?.data ?? res;
    const listArr = toArray(list);
    const found = listArr.find((it: any) => it?.avID === avID);
    
    if (!found) {
        console.warn(`[dgrrb] ensureCellId: AV ${avID} not found in block KVs`);
    } else {
        const kv = found?.keyValues?.find((x: any) => x?.key?.id === keyID);
        if (!kv) console.warn(`[dgrrb] ensureCellId: Key ${keyID} not found in KVs`);
        else if (!kv.values?.length) console.warn(`[dgrrb] ensureCellId: Key ${keyID} found but values empty`);
        
        const id = kv?.values?.[0]?.id;
        if (id) return id;
    }

    if (retry > 1 && i < retry - 1) {
      console.info(`[dgrrb] cellID for row ${rowId} key ${keyID} not found, retrying (${i + 1}/${retry})...`);
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return undefined;
}

function buildValue(keyType: string | undefined, input: any) {
  switch (keyType) {
    case "number":
      return { number: { content: Number(input), isNotEmpty: true } };
    case "mSelect":
    case "select":
      return { mSelect: input ? [{ content: String(input) }] : [] };
    case "date":
      // 对齐 kernel 返回结构：date.content 是时间戳(ms)，并且 isNotTime=true 表示纯日期
      // 注意：这里用本地时区的 00:00:00
      return {
        date: {
          content: input ? new Date(`${String(input)}T00:00:00`).getTime() : 0,
          isNotEmpty: !!input,
          hasEndDate: false,
          isNotTime: true,
          content2: 0,
          isNotEmpty2: false,
          formattedContent: "",
        },
      };
    case "relation":
      // 关系列的 value 结构在不同版本可能不同；这里不在该函数里直接处理
      return { relation: [{ content: String(input) }] };
    case "text":
    default:
      return { text: { content: String(input ?? ""), isNotEmpty: !!(input ?? "") } };
  }
}

/**
 * 将 rowId（可能是 docId 或 blockId）映射到真正的 row.id（docId）
 * itemID 必须是 row.id，而不是 block.id
 */
function resolveRowId(rowId: string): string {
  // 通过 docId 查找
  const taskByDocId = tasks.value.find(t => t.docId === rowId);
  if (taskByDocId) {
    return taskByDocId.docId;
  }

  // 通过 blockId 查找对应的 docId
  const taskByBlockId = tasks.value.find(t => t.blockId === rowId);
  if (taskByBlockId) {
    return taskByBlockId.docId;
  }

  // 找不到就报错
  throw new Error(`无法解析 rowId: ${rowId}，未在 tasks 中找到对应的行`);
}

async function batchUpdateCells(
  rowId: string,
  updates: Array<{ keyID: string; value: any; keyType?: string }>,
  options?: { reloadAfter?: boolean }
): Promise<boolean> {
  if (!config.value?.avID || updates.length === 0)
    return false;

  try {
    // 将 rowId 映射到真正的 row.id（itemID 必须是 row.id，不是 block.id）
    const actualRowId = resolveRowId(rowId);
    console.info(`[dgrrb] batchUpdateCells: resolved rowId ${rowId} -> ${actualRowId}`);

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
        itemID: actualRowId, // itemID 必须是 row.id (docId)，不是 block.id
        value: finalValue,
      };
    });

    console.info(`[dgrrb] batchUpdateCells: row=${rowId}->${actualRowId}, updates=${updates.length}`, values);
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

async function updateCell(rowId: string, keyID: string, input: any, options?: { reloadAfter?: boolean }) {
  if (!config.value?.avID)
    return;
  const cellID = await ensureCellId(rowId, config.value.avID, keyID, 5);
  if (!cellID) {
    showMessage("无法定位 cellID（请先确保该列在数据库里对该行有值/或刷新后重试）", 8000, "error");
    return;
  }
  const keyType = keyTypeById.value[keyID];
  console.info(`[dgrrb] updateCell: row=${rowId}, key=${keyID}, type=${keyType}, input=${input}, cellID=${cellID}`);
  // use requestRaw to see actual error from SiYuan
  const resp = await requestRaw("/api/av/setAttributeViewBlockAttr", {
    avID: config.value.avID,
    keyID,
    rowID: rowId,
    cellID,
    value: buildValue(keyType, input),
  });

  if (resp && resp.code !== 0) {
      console.error(`[dgrrb] updateCell failed:`, resp);
      return false;
  } else {
      console.info(`[dgrrb] updateCell success.`);
  }
  if (options?.reloadAfter !== false)
    await reload();
  return true;
}

async function onGanttUpdate(payload: { rowId: string; start?: string; end?: string; progress?: number; parentId?: string }) {
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
    await batchUpdateCells(payload.rowId, updates, { reloadAfter: true });
  } else {
    await reload();
  }
}

async function onGanttDelete(rowId: string) {
  console.info("[dgrrb] onGanttDelete starting:", rowId);
  if (!config.value?.avID)
    return;

  try {
    // 解析 rowId 为真正的 row.id (docId)
    const actualRowId = resolveRowId(rowId);
    console.info(`[dgrrb] onGanttDelete: resolved rowId ${rowId} -> ${actualRowId}`);

    // 从数据库中删除该行
    await removeAttributeViewBlocks(config.value.avID, [actualRowId]);

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

async function onGanttCreate(payload: { text: string; parent?: string; start_date: Date; duration: number }) {
  console.info("[dgrrb] onGanttCreate starting:", payload);
  if (!config.value?.avID)
    return;

  let parentID: string | undefined;
  if (payload.parent) {
    parentID = payload.parent;
  } else {
    const refTask = tasks.value[0];
    if (refTask) {
      const blockNode = await getBlockByID(refTask.blockId || refTask.docId);
      parentID = blockNode?.parent_id || refTask.docId;
    } else {
      showMessage("无法创建任务：视图为空，请先手动在数据库添加一行作为定位参考", 6000, "error");
      return;
    }
  }

  if (!parentID)
    return;

  try {
    const res = await appendBlock("markdown", payload.text || "新任务", parentID);
    if (!res || res.length === 0) {
      showMessage("思源：创建块失败", 6000, "error");
      return;
    }
    const newBlockID = (res as any)[0]?.doOperations?.[0]?.id || (res as any)[0]?.id;
    if (!newBlockID) {
      showMessage("思源：未能获取新块 ID", 6000, "error");
      return;
    }
    // 3. Add this block to the Attribute View
    console.info(`[dgrrb] adding block ${newBlockID} to AV ${config.value.avID}...`);
    await addAttributeViewBlocks(config.value.avID, [{ id: newBlockID, isDetached: false }]);

    // 4. Polling for the new row to appear in the AV
    let found = false;
    for (let i = 0; i < 10; i++) {
        await reload();
        const foundTask = tasks.value.find(t => t.docId === newBlockID || t.blockId === newBlockID);
        if (foundTask) {
            found = true;
            console.info(`[dgrrb] new row ${newBlockID} discovered. Available Cells:`, Object.keys(foundTask.cells || {}));
            break;
        }
        console.info(`[dgrrb] waiting for row ${newBlockID} to appear in AV (${i + 1}/10)...`);
        await new Promise(r => setTimeout(r, 600));
    }

    if (!found) {
        console.warn(`[dgrrb] row ${newBlockID} added but didn't appear in AV within timeout. Attributes might fail to sync.`);
    }

    // 5. Sync attributes (Dates, Parent)
    const start = toYmd(payload.start_date);
    const end = toYmd(new Date(payload.start_date.getTime() + (payload.duration - 1) * 24 * 60 * 60 * 1000));

    console.info(`[dgrrb] triggering attribute sync for row ${newBlockID}. Parent: ${payload.parent || "none"}`);
    await onGanttUpdate({
        rowId: newBlockID,
        start,
        end,
        parentId: payload.parent || "",
    });
    showMessage("添加子任务成功", 2000, "info");

  } catch (e: any) {
    console.error(e);
    showMessage(`创建失败: ${e.message || String(e)}`, 8000, "error");
  }
}

async function updateRelation(rowId: string, keyID: string, parentId: string, options?: { reloadAfter?: boolean }) {
  console.info(`[dgrrb] updateRelation: rowId=${rowId}, targetParentId=${parentId}`);
  if (!config.value?.avID)
    return;
  const cellID = await ensureCellId(rowId, config.value.avID, keyID, 5);
  if (!cellID) {
    showMessage("无法定位 cellID（请先确保该列在数据库里对该行有值/或刷新后重试）", 8000, "error");
    return;
  }

  // 如果该列其实不是 relation（例如你截图里“父任务”是 text），导致 keyType!=relation
  const keyType = keyTypeById.value[keyID];
  console.info(`[dgrrb] updateRelation: keyType=${keyType}`);
  
  let success = false;
  if (keyType && keyType !== "relation") {
    success = await updateCell(rowId, keyID, parentId, { ...options, reloadAfter: false });
    if (success) {
        if (options?.reloadAfter !== false) await reload();
        return;
    }
    console.warn(`[dgrrb] updateRelation: text update failed, falling back to relation tries...`);
  }

  const tries = [
    { relation: [{ content: parentId }] },
    { relation: [{ id: parentId }] },
    { relation: { blockIDs: [parentId] } },
  ];
  for (const value of tries) {
    const resp = await requestRaw("/api/av/setAttributeViewBlockAttr", {
      avID: config.value.avID,
      keyID,
      rowID: rowId,
      cellID,
      value,
    });
    if (resp.code === 0) {
      if (options?.reloadAfter !== false)
        await reload();
      return;
    }
  }
  showMessage("设置父任务失败：可能是关系列 value 结构与当前版本不兼容", 8000, "error");
}

function openSetting() {
  if (props.dbId) {
    props.plugin.openSetting(props.dbId);
  } else {
    props.plugin.openSetting();
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

const displayTasks = computed(() => {
  const list = tasks.value;
  const parentKeyEnabled = !!config.value?.parentKeyID;
  // 兼容：很多人父任务列会存“主键 block.id”，而不是 row.id
  const nodeId = (t: Task) => (t.blockId || t.docId);
  const byId = new Map(list.map(t => [nodeId(t), t]));
  const children = new Map<string, Task[]>();

  for (const t of list) {
    const p = parentKeyEnabled ? (t.parentId || "") : "";
    if (!children.has(p))
      children.set(p, []);
    children.get(p)!.push(t);
  }

  const isRoot = (t: Task) => {
    if (!parentKeyEnabled)
      return true;
    if (!t.parentId)
      return true;
    return !byId.has(t.parentId);
  };

  const roots = list.filter(isRoot);
  const sortFn = (a: Task, b: Task) => (a.start || "").localeCompare(b.start || "") || a.title.localeCompare(b.title);
  roots.sort(sortFn);

  const out: Array<{ task: Task; depth: number }> = [];
  const visited = new Set<string>();
  const dfs = (t: Task, depth: number) => {
    if (visited.has(t.docId))
      return;
    visited.add(t.docId);
    out.push({ task: t, depth });
    const kids = (children.get(nodeId(t)) || []).slice().sort(sortFn);
    for (const k of kids)
      dfs(k, depth + 1);
  };

  for (const r of roots)
    dfs(r, 0);

  // append any unlinked cycles
  for (const t of list) {
    if (!visited.has(t.docId))
      dfs(t, 0);
  }
  return out;
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

.dgrrb-taskgantt__raw {
  margin-top: 12px;
}

.dgrrb-taskgantt__tableWrap {
  margin-top: 12px;
  overflow: auto;
}

.dgrrb-taskgantt__titleCell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dgrrb-taskgantt__titleText {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.dgrrb-taskgantt__indent {
  display: inline-block;
  flex: 0 0 auto;
}

.dgrrb-taskgantt__idText {
  font-size: 11px;
  opacity: 0.7;
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


