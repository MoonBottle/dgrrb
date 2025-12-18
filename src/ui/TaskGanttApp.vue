<template>
  <div class="dgrrb-taskgantt">
    <div class="dgrrb-taskgantt__header">
      <div class="dgrrb-taskgantt__title">任务甘特（AV）</div>
      <div class="dgrrb-taskgantt__actions">
        <button class="b3-button b3-button--small" type="button" @click="reload">刷新</button>
        <button class="b3-button b3-button--small" type="button" @click="openSetting">设置</button>
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
import { getAttributeViewKeysByAvID, getAttributeViewKeysOfBlock, renderAttributeView, requestRaw, setAttributeViewBlockAttr } from "@/api";
import { parseRenderAttributeViewToTasks, type Task, type TaskAvConfig } from "@/domain/task";
import DhtmlxGantt from "@/ui/DhtmlxGantt.vue";

const props = defineProps<{
  plugin: Plugin;
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
  const saved = await props.plugin.loadData("task-av-config").catch(() => null) as TaskAvConfig | null;
  config.value = saved;
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

async function ensureCellId(rowId: string, avID: string, keyID: string): Promise<string | undefined> {
  // first: from parsed tasks cache
  const t = tasks.value.find(x => x.docId === rowId);
  const cached = t?.cells?.[keyID]?.cellID;
  if (cached)
    return cached;

  // fallback: query by block id (docId)
  const res = await getAttributeViewKeysOfBlock(rowId);
  const list = res?.data ?? res;
  const listArr = toArray(list);
  const found = listArr.find((it: any) => it?.avID === avID);
  const kv = found?.keyValues?.find((x: any) => x?.key?.id === keyID);
  const id = kv?.values?.[0]?.id;
  return id;
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
      return { text: { content: String(input ?? "") } };
  }
}

async function updateCell(rowId: string, keyID: string, input: any, options?: { reloadAfter?: boolean }) {
  if (!config.value?.avID)
    return;
  const cellID = await ensureCellId(rowId, config.value.avID, keyID);
  if (!cellID) {
    showMessage("无法定位 cellID（请先确保该列在数据库里对该行有值/或刷新后重试）", 8000, "error");
    return;
  }
  const keyType = keyTypeById.value[keyID];
  await setAttributeViewBlockAttr(
    config.value.avID,
    keyID,
    rowId,
    cellID,
    buildValue(keyType, input),
  );
  if (options?.reloadAfter !== false)
    await reload();
}

async function onGanttUpdate(payload: { rowId: string; start?: string; end?: string; progress?: number; parentId?: string }) {
  if (!config.value?.avID)
    return;

  // We apply updates only for the configured columns
  // Note: updateCell 会触发 reload；这里按顺序串行写入，避免并发覆盖
  if (config.value.startKeyID && payload.start)
    await updateCell(payload.rowId, config.value.startKeyID, payload.start, { reloadAfter: false });
  if (config.value.endKeyID && payload.end)
    await updateCell(payload.rowId, config.value.endKeyID, payload.end, { reloadAfter: false });
  if (config.value.progressKeyID && payload.progress !== undefined)
    await updateCell(payload.rowId, config.value.progressKeyID, payload.progress, { reloadAfter: false });
  if (config.value.parentKeyID !== undefined && payload.parentId !== undefined)
    await updateRelation(payload.rowId, config.value.parentKeyID, payload.parentId, { reloadAfter: false });
  await reload();
}

async function updateRelation(rowId: string, keyID: string, parentId: string, options?: { reloadAfter?: boolean }) {
  if (!config.value?.avID)
    return;
  const cellID = await ensureCellId(rowId, config.value.avID, keyID);
  if (!cellID) {
    showMessage("无法定位 cellID（请先确保该列在数据库里对该行有值/或刷新后重试）", 8000, "error");
    return;
  }

  // 如果该列其实不是 relation（例如你截图里“父任务”是 text），就走普通写入
  const keyType = keyTypeById.value[keyID];
  if (keyType && keyType !== "relation") {
    await updateCell(rowId, keyID, parentId, options);
    return;
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
  showMessage("请在思源：设置 → 插件 → 本插件 → 设置 里配置 AV", 6000, "info");
  props.plugin.openSetting();
}

onMounted(() => {
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


