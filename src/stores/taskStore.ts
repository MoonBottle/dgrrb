import { defineStore } from "pinia";
import { computed } from "vue";
import type { TableData, TableRow } from "@/types/tableData";
import type { IResRenderAttributeView } from "@/types/api";
import { getAttributeViewKeysByAvID, renderAttributeView, batchSetAttributeViewBlockAttrs, removeAttributeViewBlocks, appendBlock, addAttributeViewBlocks, appendAttributeViewDetachedBlocksWithValues, getBlockByID } from "@/api";
import { convertKeysToColumns, convertToTableData } from "@/utils/tableData";
import { valueToText } from "@/domain/task";
import { buildValue } from "@/utils";
import { nanoid } from "nanoid";
import { showMessage } from "siyuan";
import { useUiStore } from "./uiStore";
import { useConfigStore } from "./configStore";
import { useFilterStore } from "./filterStore";

export const useTaskStore = defineStore("task", {
  state: () => ({
    rawData: null as IResRenderAttributeView | null,
    tableData: { rows: [], columns: [] } as TableData,
    keyTypeById: {} as Record<string, string>,
    keysById: {} as Record<string, any>,
  }),

  getters: {
    /**
     * 根据 filterStore 的筛选条件返回筛选后的行数据
     */
    getFilteredRows(): TableRow[] {
      const filterStore = useFilterStore();
      const configStore = useConfigStore();
      const config = configStore.currentConfig;
      
      if (!config) return this.tableData.rows;

      return this.tableData.rows.filter((row) => {
        // 状态筛选
        if (filterStore.filterStatus && config.statusKeyID) {
          const statusCell = row.cells[config.statusKeyID];
          const statusText = statusCell?.text || "";
          if (statusText !== filterStore.filterStatus) {
            return false;
          }
        }

        // 类型筛选
        if (filterStore.filterType && config.typeKeyID) {
          const typeCell = row.cells[config.typeKeyID];
          const typeText = typeCell?.text || "";
          if (typeText !== filterStore.filterType) {
            return false;
          }
        }

        // 项目筛选
        if (filterStore.filterProject && config.projectKeyID) {
          const projectCell = row.cells[config.projectKeyID];
          const projectText = projectCell?.text || "";
          if (projectText !== filterStore.filterProject) {
            return false;
          }
        }

        return true;
      });
    },
  },

  actions: {
    /**
     * 加载任务数据
     */
    async loadTasks(avID: string, viewID?: string) {
      const uiStore = useUiStore();
      const configStore = useConfigStore();

      uiStore.setLoading(true);
      uiStore.clearError();

      try {
        // 1. 获取字段定义
        const keys = await getAttributeViewKeysByAvID(avID);
        const columns = convertKeysToColumns(keys);
        
        // 构建 keyTypeById 和 keysById 映射
        this.keyTypeById = Object.fromEntries(
          columns.map(col => [col.keyID, col.type])
        );
        this.keysById = Object.fromEntries(
          columns.map(col => [col.keyID, { id: col.keyID, name: col.name, type: col.type, options: col.options }])
        );

        // 2. 获取行数据
        const rawData = await renderAttributeView(avID, {
          viewID: viewID || undefined,
          page: 1,
          pageSize: -1,
        });

        this.rawData = rawData;
        this.tableData = convertToTableData(rawData, columns);
      } catch (e: any) {
        console.error("[dgrrb] taskStore.loadTasks error:", e);
        uiStore.setError(e?.message || String(e));
        throw e;
      } finally {
        uiStore.setLoading(false);
      }
    },

    /**
     * 更新任务
     */
    async updateTask(itemID: string, updates: Array<{ keyID: string; value: any; keyType?: string }>, options?: { reloadAfter?: boolean }) {
      const configStore = useConfigStore();
      const uiStore = useUiStore();
      const config = configStore.currentConfig;

      if (!config?.avID || updates.length === 0)
        return false;

      try {
        // 构建批量请求的 values 数组
        const values = updates.map(({ keyID, value, keyType }) => {
          const actualKeyType = keyType || this.keyTypeById[keyID];
          // 对于关系类型，使用第一种格式（如果失败会在外层重试其他格式）
          // 对于其他类型，使用 buildValue 构建
          const finalValue = actualKeyType === "relation" && value
            ? { relation: [{ content: String(value) }] }
            : buildValue(actualKeyType, value);

          return {
            keyID,
            itemID,
            value: finalValue,
          };
        });

        console.info(`[dgrrb] taskStore.updateTask: itemID=${itemID}, updates=${updates.length}`, values);
        const resp = await batchSetAttributeViewBlockAttrs(config.avID, values);

        if (resp && resp.code !== 0) {
          console.error(`[dgrrb] taskStore.updateTask failed:`, resp);

          // 对于关系类型字段，如果批量接口失败，尝试多种格式
          const relationUpdates = updates.filter((u) => {
            const keyType = u.keyType || this.keyTypeById[u.keyID];
            return keyType === "relation" && u.value;
          });

          if (relationUpdates.length > 0) {
            console.info(`[dgrrb] taskStore.updateTask: retrying relation fields with alternative formats...`);
            // 尝试其他关系格式
            const relationTries = [
              { relation: [{ content: String(relationUpdates[0].value) }] },
              { relation: [{ id: String(relationUpdates[0].value) }] },
              { relation: { blockIDs: [String(relationUpdates[0].value)] } },
            ];

            for (const relationValue of relationTries) {
              const retryValues = values.map((v) => {
                const update = updates.find((u) => u.keyID === v.keyID);
                if (update && (update.keyType || this.keyTypeById[update.keyID]) === "relation") {
                  return { ...v, value: relationValue };
                }
                return v;
              });

              const retryResp = await batchSetAttributeViewBlockAttrs(config.avID, retryValues);
              if (retryResp.code === 0) {
                console.info(`[dgrrb] taskStore.updateTask: retry succeeded with format:`, relationValue);
                if (options?.reloadAfter !== false) {
                  await this.loadTasks(config.avID, config.viewID);
                }
                return true;
              }
            }
          }

          showMessage("批量更新失败", 8000, "error");
          return false;
        }

        console.info(`[dgrrb] taskStore.updateTask success`);
        if (options?.reloadAfter !== false) {
          await this.loadTasks(config.avID, config.viewID);
        }
        return true;
      } catch (e: any) {
        console.error(`[dgrrb] taskStore.updateTask error:`, e);
        showMessage(`批量更新失败: ${e.message || String(e)}`, 8000, "error");
        return false;
      }
    },

    /**
     * 创建任务
     */
    async createTask(payload: { text: string; parent?: string; start_date: Date; duration: number }): Promise<string> {
      const configStore = useConfigStore();
      const config = configStore.currentConfig;

      if (!config?.avID)
        throw new Error("未配置 avID");

      let parentID: string | undefined;
      if (payload.parent) {
        // 如果 parent 是甘特图 ID，需要转换为 itemID
        const row = this.tableData.rows.find(r => String(r.blockId || r.itemID) === payload.parent);
        if (row) {
          parentID = row.blockId || row.itemID;
        } else {
          parentID = payload.parent;
        }
      }

      // 如果没有指定父任务，使用第一个任务作为参考
      if (!parentID) {
        const refRow = this.tableData.rows[0];
        if (refRow) {
          const blockNode = await getBlockByID(refRow.blockId || refRow.itemID);
          parentID = blockNode?.parent_id || refRow.itemID;
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

        // 添加块到属性视图
        console.info(`[dgrrb] taskStore.createTask: adding block ${newBlockID} to AV ${config.avID} with itemID ${itemID}...`);
        await addAttributeViewBlocks(config.avID, [{ id: newBlockID, isDetached: false, itemID }]);

        // 轮询等待新行出现
        let found = false;
        for (let i = 0; i < 10; i++) {
          await this.loadTasks(config.avID, config.viewID);
          const foundRow = this.tableData.rows.find(r => r.itemID === itemID || r.itemID === newBlockID || r.blockId === newBlockID);
          if (foundRow) {
            found = true;
            console.info(`[dgrrb] taskStore.createTask: new row ${itemID} discovered.`);
            break;
          }
          console.info(`[dgrrb] taskStore.createTask: waiting for row ${itemID} to appear in AV (${i + 1}/10)...`);
          await new Promise(r => setTimeout(r, 600));
        }

        if (!found) {
          console.warn(`[dgrrb] taskStore.createTask: row ${itemID} added but didn't appear in AV within timeout.`);
        }

        // 同步属性（日期、父任务）
        const toYmd = (d: Date): string => {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          return `${yyyy}-${mm}-${dd}`;
        };

        const start = toYmd(payload.start_date);
        const end = toYmd(new Date(payload.start_date.getTime() + (payload.duration - 1) * 24 * 60 * 60 * 1000));

        console.info(`[dgrrb] taskStore.createTask: triggering attribute sync for itemID ${itemID}.`);
        await this.updateTaskFields(itemID, {
          start,
          end,
          parentId: payload.parent || "",
        });

        return itemID;
      } catch (e: any) {
        console.error("[dgrrb] taskStore.createTask error:", e);
        showMessage(`创建失败: ${e.message || String(e)}`, 8000, "error");
        throw e;
      }
    },

    /**
     * 创建成果
     */
    async createOutcome(payload: {
      text: string;
      parent?: string;
      start_date: Date;
      duration: number;
      fields?: Record<string, any>;
    }): Promise<string> {
      const configStore = useConfigStore();
      const config = configStore.currentConfig;

      if (!config?.avID) {
        throw new Error("数据库配置缺失");
      }

      try {
        // 生成 itemID（思源格式：时间戳-随机字符串）
        const itemID = `${Date.now()}-${nanoid()}`;

        console.info(`[dgrrb] taskStore.createOutcome: creating outcome with itemID ${itemID}...`);

        // 构建 blocksValues（二维数组，一行数据）
        const blocksValues: Array<Array<{ keyID: string; [key: string]: any }>> = [[]];

        // 添加所有字段的值
        if (payload.fields) {
          for (const [keyID, value] of Object.entries(payload.fields)) {
            const keyType = this.keyTypeById[keyID];
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

        // 调用 API 创建非绑定块
        console.info(`[dgrrb] taskStore.createOutcome: calling appendAttributeViewDetachedBlocksWithValues for AV ${config.avID}...`);
        await appendAttributeViewDetachedBlocksWithValues(config.avID, blocksValues);

        // 刷新数据
        await this.loadTasks(config.avID, config.viewID);

        return itemID;
      } catch (e: any) {
        console.error("[dgrrb] taskStore.createOutcome error:", e);
        showMessage(`创建成果失败: ${e.message || String(e)}`, 8000, "error");
        throw e;
      }
    },

    /**
     * 删除任务
     */
    async deleteTask(itemID: string) {
      const configStore = useConfigStore();
      const config = configStore.currentConfig;

      console.info("[dgrrb] taskStore.deleteTask starting:", itemID);
      if (!config?.avID)
        return;

      try {
        // 从数据库中删除该行
        await removeAttributeViewBlocks(config.avID, [itemID]);

        // 刷新数据
        await this.loadTasks(config.avID, config.viewID);
        showMessage("删除任务成功", 2000, "info");
      } catch (e: any) {
        console.error("[dgrrb] taskStore.deleteTask error:", e);
        showMessage(`删除失败: ${e.message || String(e)}`, 8000, "error");
        throw e;
      }
    },

    /**
     * 更新任务字段（用于甘特图更新）
     */
    async updateTaskFields(itemID: string, payload: { start?: string; end?: string; progress?: number; parentId?: string }) {
      const configStore = useConfigStore();
      const config = configStore.currentConfig;

      if (!config?.avID)
        return;

      // 收集所有需要更新的字段
      const updates: Array<{ keyID: string; value: any; keyType?: string }> = [];

      if (config.startKeyID && payload.start !== undefined) {
        updates.push({
          keyID: config.startKeyID,
          value: payload.start,
          keyType: this.keyTypeById[config.startKeyID],
        });
      }

      if (config.endKeyID && payload.end !== undefined) {
        updates.push({
          keyID: config.endKeyID,
          value: payload.end,
          keyType: this.keyTypeById[config.endKeyID],
        });
      }

      if (config.progressKeyID && payload.progress !== undefined) {
        updates.push({
          keyID: config.progressKeyID,
          value: payload.progress,
          keyType: this.keyTypeById[config.progressKeyID],
        });
      }

      if (config.parentKeyID !== undefined && payload.parentId !== undefined) {
        const parentKeyType = this.keyTypeById[config.parentKeyID];
        updates.push({
          keyID: config.parentKeyID,
          value: payload.parentId,
          keyType: parentKeyType,
        });
      }

      // 使用批量接口一次性更新所有字段
      if (updates.length > 0) {
        await this.updateTask(itemID, updates, { reloadAfter: true });
      } else {
        await this.loadTasks(config.avID, config.viewID);
      }
    },

    /**
     * 更新任务字段（用于详情对话框）
     */
    async updateFields(itemID: string, updates: Record<string, any>) {
      const configStore = useConfigStore();
      const config = configStore.currentConfig;

      console.info("[dgrrb] taskStore.updateFields called", itemID, updates);
      if (!config?.avID) {
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

        console.info(`[dgrrb] taskStore.updateFields: updating ${values.length} fields for itemID ${itemID}`);
        const resp = await batchSetAttributeViewBlockAttrs(config.avID, values);

        if (resp && resp.code !== 0) {
          console.error(`[dgrrb] taskStore.updateFields failed:`, resp);
          showMessage("更新字段失败", 5000, "error");
          return;
        }

        console.info(`[dgrrb] taskStore.updateFields success`);
        // 刷新数据
        await this.loadTasks(config.avID, config.viewID);
      } catch (e: any) {
        console.error(`[dgrrb] taskStore.updateFields error:`, e);
        showMessage(`更新字段失败: ${e.message || String(e)}`, 5000, "error");
        throw e;
      }
    },

    /**
     * 根据 itemID 获取任务数据（从 tableData 转换）
     */
    getTaskByItemID(itemID: string) {
      const row = this.tableData.rows.find(r => r.itemID === itemID);
      if (!row) return null;

      const configStore = useConfigStore();
      const config = configStore.currentConfig;
      if (!config) return null;

      // 转换为 Task 格式（用于向后兼容）
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
      const blockColumn = this.tableData.columns.find(c => c.type === "block");
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
    },
  },
});
