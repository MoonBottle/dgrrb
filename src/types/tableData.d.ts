/**
 * 行列式数据结构类型定义
 */

export interface TableData {
  rows: TableRow[];      // 行数据数组，每行代表一个任务/记录
  columns: TableColumn[]; // 列定义数组，每列代表一个字段
}

export interface TableRow {
  itemID: string;        // 行 ID，对应 renderAttributeView 中的 row.id
  blockId?: string;      // 主键 block ID，从 block 类型字段中提取（用于甘特图等场景）
  cells: Record<string, TableCell>; // 单元格数据对象，key 为 keyID，value 为 TableCell
}

export interface TableColumn {
  keyID: string;        // 字段 ID，唯一标识符
  name: string;         // 字段名称
  type: string;         // 字段类型：text, number, date, select, mSelect, relation, block 等
  options?: any[];      // 选项数组（仅用于 select/mSelect 类型字段）
}

export interface TableCell {
  cellID?: string;      // 单元格 ID（如果存在）
  value: any;           // 原始值对象，保持 renderAttributeView 中的原始结构
  text?: string;         // 文本表示，用于显示（通过 valueToText 转换）
}
