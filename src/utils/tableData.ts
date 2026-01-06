import type { TableData, TableRow, TableColumn, TableCell } from "@/types/tableData";
import type { IResRenderAttributeView } from "@/types/api";
import { valueToText } from "@/domain/task";

/**
 * 将 getAttributeViewKeysByAvID 返回的数据转换为 TableColumn[]
 */
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

/**
 * 从 getAttributeViewKeysByAvID 返回的数据中提取列定义
 */
export function convertKeysToColumns(keysRes: any): TableColumn[] {
  const keyArr = normalizeAvKeys(keysRes);
  return keyArr.map((key: any) => ({
    keyID: key.id,
    name: key.name || key.label || key.id,
    type: key.type || "text",
    options: key.options || [],
  }));
}

/**
 * 从 row.cells 中查找指定 keyID 的单元格
 */
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

/**
 * 提取单元格的 ID 和值
 */
function extractCellIdAndValue(cell: any): { cellID?: string; value: any } {
  if (!cell)
    return { value: undefined };

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

/**
 * 将 renderAttributeView 返回的数据转换为 TableData
 * @param renderRes renderAttributeView 返回的原始数据
 * @param columns 列定义（从 getAttributeViewKeysByAvID 获取）
 */
export function convertToTableData(
  renderRes: IResRenderAttributeView,
  columns: TableColumn[]
): TableData {
  const view = renderRes?.view ?? renderRes?.data?.view;
  const rows = view?.rows ?? view?.data?.rows ?? [];

  if (!Array.isArray(rows))
    return { rows: [], columns };

  const tableRows: TableRow[] = [];

  for (const row of rows) {
    const itemID = row?.id;
    if (!itemID)
      continue;

    const cells: Record<string, TableCell> = {};
    let blockId: string | undefined;

    // 遍历所有列定义，提取单元格数据
    for (const column of columns) {
      const cell = findCellInRow(row, column.keyID);
      const { cellID, value } = extractCellIdAndValue(cell);

      // 如果是 block 类型，提取 blockId
      if (column.type === "block" && value?.block) {
        blockId = value.block.id || value.block.blockID || value.block.blockId;
      }

      // 构建 TableCell
      cells[column.keyID] = {
        cellID,
        value,
        text: value ? valueToText(value) : undefined,
      };
    }

    tableRows.push({
      itemID: String(itemID),
      blockId: blockId ? String(blockId) : undefined,
      cells,
    });
  }

  return {
    rows: tableRows,
    columns,
  };
}
