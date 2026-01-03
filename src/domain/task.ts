export type TaskAvConfig = {
  avID: string;
  viewID?: string;
  startKeyID?: string;
  endKeyID?: string;
  statusKeyID?: string;
  parentKeyID?: string;
  progressKeyID?: string;
  typeKeyID?: string;
};

export type DatabaseConfig = {
  id: string;
  name: string;
  config: TaskAvConfig;
};

export type TaskCell = {
  cellID?: string;
  value?: any;
};

export type Task = {
  docId: string;
  /** Primary block id in the "主键(block)" cell, if exists */
  blockId?: string;
  title: string;
  start?: string;
  end?: string;
  status?: string;
  progress?: number;
  parentId?: string;
  cells: Record<string, TaskCell>;
};

function firstDefined<T>(...vals: Array<T | undefined | null>): T | undefined {
  for (const v of vals) {
    if (v !== undefined && v !== null)
      return v;
  }
  return undefined;
}

function normalizeDate(v: any): string | undefined {
  if (!v)
    return undefined;
  if (typeof v === "string") {
    // already looks like YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(v))
      return v;
    // try parse
    const d = new Date(v);
    if (!Number.isNaN(d.getTime()))
      return d.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    const d = new Date(v);
    if (Number.isNaN(d.getTime()))
      return undefined;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof v === "object") {
    const c = firstDefined(
      v?.date?.content,
      v?.content,
      v?.number?.content,
    );
    return normalizeDate(c);
  }
  return undefined;
}

export function valueToText(v: any): string {
  if (v === undefined || v === null)
    return "";
  if (typeof v === "string")
    return v;
  if (typeof v === "number")
    return String(v);
  if (Array.isArray(v)) {
    const first = v[0];
    if (typeof first === "string")
      return first;
    if (first && typeof first === "object")
      return first.content ?? first.name ?? "";
    return "";
  }
  if (typeof v === "object") {
    if (v.text?.content !== undefined)
      return valueToText(v.text.content);
    if (v.block?.content !== undefined)
      return valueToText(v.block.content);
    if (v.number?.content !== undefined)
      return valueToText(v.number.content);
    if (v.date?.content !== undefined)
      return valueToText(v.date.content);
    if (v.content !== undefined)
      return valueToText(v.content);
    if (v.relation !== undefined)
      return valueToText(v.relation);
    if (v.mSelect !== undefined)
      return valueToText(v.mSelect);
    if (v.select !== undefined)
      return valueToText(v.select);

    if (v.id !== undefined)
      return valueToText(v.id);
    if (v.blockID !== undefined)
      return valueToText(v.blockID);
    if (v.blockId !== undefined)
      return valueToText(v.blockId);
  }
  return "";
}

function valueToNumber(v: any): number | undefined {
  if (v === undefined || v === null)
    return undefined;
  if (typeof v === "number")
    return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof v === "object") {
    return valueToNumber(firstDefined(v.number?.content, v.content));
  }
  return undefined;
}

function findCellInRow(row: any, keyID: string): any | undefined {
  if (!row || !keyID)
    return undefined;

  // common shapes
  if (row.cells) {
    if (Array.isArray(row.cells)) {
      return row.cells.find((c: any) =>
        c?.keyID === keyID
        || c?.keyId === keyID
        || c?.key?.id === keyID
        || c?.key?.ID === keyID
        || c?.value?.keyID === keyID
        || c?.value?.keyId === keyID
        || c?.value?.key?.id === keyID
        || c?.value?.key?.ID === keyID
      );
    }
    if (typeof row.cells === "object") {
      return row.cells[keyID] ?? row.cells[keyID.toString()];
    }
  }

  if (Array.isArray(row.keyValues)) {
    return row.keyValues.find((kv: any) => kv?.key?.id === keyID || kv?.keyID === keyID);
  }

  if (Array.isArray(row.cellValues)) {
    return row.cellValues.find((cv: any) => cv?.keyID === keyID);
  }

  return undefined;
}

function extractCellIdAndValue(cell: any): TaskCell {
  if (!cell)
    return {};

  // keyValues style: { key, values: [{id, ... , value?}] }
  if (Array.isArray(cell.values) && cell.values.length > 0) {
    const v0 = cell.values[0];
    return {
      cellID: v0?.id ?? v0?.cellID,
      value: v0?.value ?? v0,
    };
  }

  return {
    cellID: cell.id ?? cell.cellID,
    value: cell.value ?? cell?.value ?? cell,
  };
}

export function extractId(v: any): string {
  const s = valueToText(v).trim();
  if (!s)
    return "";
  // Check for SiYuan block ref formats: ((id)) or ((id "title")) or [[id]]
  const match = s.match(/^\(\(([a-zA-Z0-9-]+)(?:\s+"[^"]*")?\)\)$/) || s.match(/^\[\[([a-zA-Z0-9-]+)\]\]$/);
  return match ? match[1] : s;
}

export function parseRenderAttributeViewToTasks(
  renderRes: any,
  config: TaskAvConfig
): Task[] {
  const view = renderRes?.view ?? renderRes?.data?.view;
  const rows = view?.rows ?? view?.data?.rows ?? [];

  if (!Array.isArray(rows))
    return [];

  const tasks: Task[] = [];
  for (const row of rows) {
    const docId = row?.id ?? row?.rowID ?? row?.rowId ?? row?.blockID ?? row?.blockId;
    if (!docId)
      continue;

    const cells: Record<string, TaskCell> = {};
    const collect = (keyID?: string) => {
      if (!keyID)
        return;
      const cell = findCellInRow(row, keyID);
      cells[keyID] = extractCellIdAndValue(cell);
    };

    collect(config.startKeyID);
    collect(config.endKeyID);
    collect(config.statusKeyID);
    collect(config.parentKeyID);
    collect(config.progressKeyID);

    // Title & primary blockId usually come from the "block" (primary key) cell
    const primaryCell = Array.isArray(row?.cells)
      ? row.cells.find((c: any) =>
        c?.valueType === "block"
        || c?.value?.type === "block"
        || c?.value?.block?.content !== undefined
      )
      : undefined;
    const primaryBlockId = primaryCell?.value?.block?.id ?? primaryCell?.value?.blockID;
    const title = firstDefined(
      valueToText(primaryCell?.value?.block?.content),
      valueToText(primaryCell?.value?.block?.name),
      valueToText(row?.title),
      valueToText(row?.name),
      valueToText(row?.block?.content),
      valueToText(row?.content),
      valueToText(row?.blockContent),
    ) || String(docId);

    const start = config.startKeyID ? normalizeDate(cells[config.startKeyID]?.value) : undefined;
    const end = config.endKeyID ? normalizeDate(cells[config.endKeyID]?.value) : undefined;

    const status = config.statusKeyID ? valueToText(cells[config.statusKeyID]?.value) : undefined;
    const progress = config.progressKeyID ? valueToNumber(cells[config.progressKeyID]?.value) : undefined;

    const parentId = config.parentKeyID ? extractId(cells[config.parentKeyID]?.value) : undefined;

    tasks.push({
      docId: String(docId),
      blockId: primaryBlockId ? String(primaryBlockId) : undefined,
      title,
      start,
      end,
      status,
      progress,
      parentId,
      cells,
    });
  }
  if (tasks.length > 0) {
    console.info("[dgrrb] parsed tasks (sample 0):", {
      title: tasks[0].title,
      docId: tasks[0].docId,
      blockId: tasks[0].blockId,
      parentId: tasks[0].parentId,
    });
  }
  return tasks;
}


