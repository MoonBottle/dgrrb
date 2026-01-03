<template>
  <div class="dgrrb-task-detail-dialog">
    <div class="dgrrb-task-detail-header">
      <div class="dgrrb-task-detail-title">创建任务</div>
      <div style="font-size: 11px; opacity: 0.6; margin-top: 4px;">
        字段数: {{ fields.length }}
      </div>
    </div>
    
    <div class="dgrrb-task-detail-content" v-if="fields.length > 0">
      <div 
        v-for="field in fields" 
        :key="field.keyID" 
        class="dgrrb-task-detail-field"
      >
        <label class="dgrrb-task-detail-label">{{ field.name }}</label>
        <div class="dgrrb-task-detail-input">
          <!-- 文本类型 -->
          <input
            v-if="field.type === 'text'"
            v-model="fieldValues[field.keyID]"
            class="b3-text-field"
            type="text"
            :placeholder="`请输入${field.name}`"
          />
          
          <!-- 数字类型 -->
          <input
            v-else-if="field.type === 'number'"
            v-model.number="fieldValues[field.keyID]"
            class="b3-text-field"
            type="number"
            :placeholder="`请输入${field.name}`"
          />
          
          <!-- 日期类型 -->
          <input
            v-else-if="field.type === 'date'"
            v-model="fieldValues[field.keyID]"
            class="b3-text-field"
            type="date"
          />
          
          <!-- 选择类型（单选） -->
          <select
            v-else-if="field.type === 'select'"
            v-model="fieldValues[field.keyID]"
            class="b3-select"
          >
            <option value="">请选择</option>
            <option 
              v-for="option in field.options" 
              :key="option.id || option.name"
              :value="option.name || option.content"
            >
              {{ option.name || option.content }}
            </option>
          </select>
          
          <!-- 多选类型 -->
          <div v-else-if="field.type === 'mSelect'" class="dgrrb-mselect-wrapper">
            <label 
              v-for="option in field.options" 
              :key="option.id || option.name"
              class="dgrrb-mselect-option"
            >
              <input
                type="checkbox"
                :value="option.name || option.content"
                :checked="Array.isArray(fieldValues[field.keyID]) && fieldValues[field.keyID].includes(option.name || option.content)"
                @change="(e) => {
                  const target = e.target as HTMLInputElement;
                  const val = fieldValues[field.keyID] || [];
                  if (target.checked) {
                    fieldValues[field.keyID] = [...val, option.name || option.content];
                  } else {
                    fieldValues[field.keyID] = val.filter((v: any) => v !== (option.name || option.content));
                  }
                }"
              />
              <span>{{ option.name || option.content }}</span>
            </label>
          </div>
          
          <!-- 关系类型 -->
          <input
            v-else-if="field.type === 'relation'"
            v-model="fieldValues[field.keyID]"
            class="b3-text-field"
            type="text"
            :placeholder="`请输入块ID或文档ID`"
          />
          
          <!-- block 类型（主键，任务名称） -->
          <input
            v-else-if="field.type === 'block'"
            v-model="fieldValues[field.keyID]"
            class="b3-text-field"
            type="text"
            :placeholder="`请输入${field.name}（必填）`"
            required
          />
          
          <!-- 其他类型默认使用文本输入 -->
          <input
            v-else
            v-model="fieldValues[field.keyID]"
            class="b3-text-field"
            type="text"
            :placeholder="`请输入${field.name}`"
          />
        </div>
      </div>
    </div>
    
    <div v-else class="dgrrb-task-detail-empty">
      <div>加载中... (字段数: {{ fields.length }})</div>
    </div>
    
    <div class="dgrrb-task-detail-actions">
      <button 
        class="b3-button b3-button--cancel" 
        @click="handleCancel"
      >
        取消
      </button>
      <button 
        class="b3-button b3-button--text" 
        @click="handleCreate"
        :disabled="creating"
      >
        {{ creating ? '创建中...' : '创建' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { showMessage } from "siyuan";
import type { TaskAvConfig } from "@/domain/task";

const props = defineProps<{
  avID: string;
  rawData: any;
  keyTypeById: Record<string, string>;
  config: TaskAvConfig;
  parentTaskId?: string;
  onCreate: (payload: { text: string; parent?: string; start_date: Date; duration: number }) => Promise<string>;
  onUpdate: (rowId: string, updates: Record<string, any>) => Promise<void>;
  onClose?: () => void;
}>();

const fields = ref<Array<{
  keyID: string;
  name: string;
  type: string;
  options?: any[];
}>>([]);

const fieldValues = ref<Record<string, any>>({});
const creating = ref(false);

// 构建字段值的函数
function buildValue(keyType: string | undefined, input: any) {
  switch (keyType) {
    case "block":
      return { block: { content: String(input ?? "") } };
    case "number":
      return {
        number: {
          content: Number(input) || 0,
          isNotEmpty: input !== undefined && input !== null && input !== "",
          format: "",
          formattedContent: "",
        },
      };
    case "select":
      return { mSelect: input ? [{ content: String(input) }] : [] };
    case "mSelect":
      if (Array.isArray(input)) {
        return { mSelect: input.map((v: any) => ({ content: String(v) })) };
      } else if (typeof input === "string" && input.includes(",")) {
        return { mSelect: input.split(",").map((v: string) => ({ content: v.trim() })) };
      } else if (input) {
        return { mSelect: [{ content: String(input) }] };
      }
      return { mSelect: [] };
    case "date":
      return {
        date: {
          content: input ? new Date(`${String(input)}T00:00:00`).getTime() : 0,
          isNotEmpty: input !== undefined && input !== null && input !== "",
          hasEndDate: false,
          isNotTime: true,
          content2: 0,
          isNotEmpty2: false,
          formattedContent: "",
        },
      };
    case "relation":
      return { relation: [{ content: String(input) }] };
    case "text":
    default:
      return { text: { content: String(input ?? "") } };
  }
}

// 初始化字段列表
function initializeFields() {
  console.info("[dgrrb] TaskCreateDialog: initializeFields called");
  
  // 获取所有字段定义 - 从 keyTypeById 中获取所有已知的字段
  const allKeyIds = Object.keys(props.keyTypeById);
  console.info("[dgrrb] TaskCreateDialog: allKeyIds", allKeyIds);
  
  // 尝试从 rawData 中获取字段名称和选项
  const view = props.rawData?.view ?? props.rawData?.data?.view;
  const columns = view?.columns ?? view?.data?.columns ?? [];
  const columnMap = new Map<string, any>();
  
  if (Array.isArray(columns)) {
    console.info("[dgrrb] TaskCreateDialog: found columns", columns.length);
    for (const col of columns) {
      const keyId = col.keyID || col.keyId || col.id;
      if (keyId) {
        columnMap.set(keyId, col);
      }
    }
  } else {
    console.warn("[dgrrb] TaskCreateDialog: columns is not an array", columns);
  }
  
  // 构建字段列表 - 使用所有在 keyTypeById 中的字段
  fields.value = allKeyIds.map((keyID) => {
    const col = columnMap.get(keyID);
    return {
      keyID,
      name: col?.name || col?.label || keyID,
      type: props.keyTypeById[keyID] || "text",
      options: col?.options || col?.option || [],
    };
  });
  
  console.info("[dgrrb] TaskCreateDialog: fields built", fields.value);
  
  // 初始化字段值为空
  const values: Record<string, any> = {};
  for (const field of fields.value) {
    values[field.keyID] = "";
  }
  
  // 设置默认值
  const today = new Date().toISOString().slice(0, 10);
  if (props.config.startKeyID) {
    values[props.config.startKeyID] = today;
  }
  if (props.config.endKeyID) {
    values[props.config.endKeyID] = today;
  }
  if (props.parentTaskId && props.config.parentKeyID) {
    values[props.config.parentKeyID] = props.parentTaskId;
  }
  
  // 设置状态默认值为"进行中"
  if (props.config.statusKeyID) {
    const statusField = fields.value.find(f => f.keyID === props.config.statusKeyID);
    if (statusField) {
      // 查找"进行中"选项
      const inProgressOption = statusField.options?.find((opt: any) => {
        const optName = opt.name || opt.content || "";
        return optName === "进行中" || optName.toLowerCase().includes("进行中");
      });
      if (inProgressOption) {
        values[props.config.statusKeyID] = inProgressOption.name || inProgressOption.content || "进行中";
      } else {
        // 如果没有找到，直接使用"进行中"
        values[props.config.statusKeyID] = "进行中";
      }
    }
  }
  
  // 设置类型默认值为"任务"
  if (props.config.typeKeyID) {
    const typeField = fields.value.find(f => f.keyID === props.config.typeKeyID);
    if (typeField) {
      // 查找"任务"选项
      const taskOption = typeField.options?.find((opt: any) => {
        const optName = opt.name || opt.content || "";
        return optName === "任务" || optName.toLowerCase().includes("任务");
      });
      if (taskOption) {
        values[props.config.typeKeyID] = taskOption.name || taskOption.content || "任务";
      } else {
        // 如果没有找到，直接使用"任务"
        values[props.config.typeKeyID] = "任务";
      }
    }
  }
  
  // 设置进度默认值为0
  if (props.config.progressKeyID) {
    values[props.config.progressKeyID] = 0;
  }
  
  fieldValues.value = values;
  
  console.info("[dgrrb] TaskCreateDialog: initialized", {
    fieldCount: fields.value.length,
    fieldValues: fieldValues.value,
  });
}

// 创建任务
async function handleCreate() {
  if (creating.value) {
    return;
  }
  
  // 验证必填字段（主键 block 字段）
  const blockKeyId = fields.value.find(f => f.type === "block")?.keyID;
  if (blockKeyId) {
    const taskName = fieldValues.value[blockKeyId];
    if (!taskName || String(taskName).trim() === "") {
      showMessage("请输入任务名称", 3000, "error");
      return;
    }
  }
  
  creating.value = true;
  
  try {
    // 提取任务名称（主键 block 字段）
    const blockKeyId = fields.value.find(f => f.type === "block")?.keyID;
    const taskName = blockKeyId ? String(fieldValues.value[blockKeyId] || "").trim() : "新任务";
    
    // 提取开始日期和结束日期
    const startDateStr = props.config.startKeyID ? fieldValues.value[props.config.startKeyID] : "";
    const endDateStr = props.config.endKeyID ? fieldValues.value[props.config.endKeyID] : "";
    
    const startDate = startDateStr ? new Date(`${startDateStr}T00:00:00`) : new Date();
    const endDate = endDateStr ? new Date(`${endDateStr}T00:00:00`) : startDate;
    
    // 计算持续时间（天数，包含开始和结束日期）
    const duration = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1);
    
    // 提取父任务 ID
    const parentId = props.config.parentKeyID ? fieldValues.value[props.config.parentKeyID] : props.parentTaskId;
    
    // 调用 onCreate 创建任务
    console.info("[dgrrb] TaskCreateDialog: creating task", {
      text: taskName,
      parent: parentId,
      start_date: startDate,
      duration,
    });
    
    const rowId = await props.onCreate({
      text: taskName,
      parent: parentId,
      start_date: startDate,
      duration,
    });
    
    if (!rowId) {
      showMessage("创建任务失败：未返回任务 ID", 5000, "error");
      creating.value = false;
      return;
    }
    
    console.info("[dgrrb] TaskCreateDialog: task created, rowId:", rowId);
    
    // 等待一下，确保任务已创建
    await new Promise(r => setTimeout(r, 1000));
    
    // 构建其他字段的更新
    const updates: Record<string, any> = {};
    
    for (const field of fields.value) {
      // 跳过主键 block 字段（已经在创建时设置）
      if (field.type === "block") {
        continue;
      }
      
      // 跳过开始日期和结束日期（已经在创建时设置）
      if (field.keyID === props.config.startKeyID || field.keyID === props.config.endKeyID) {
        continue;
      }
      
      // 跳过父任务（如果已经在创建时设置）
      if (field.keyID === props.config.parentKeyID && parentId) {
        continue;
      }
      
      const value = fieldValues.value[field.keyID];
      if (value !== undefined && value !== null && value !== "") {
        const keyType = props.keyTypeById[field.keyID];
        updates[field.keyID] = buildValue(keyType, value);
      }
    }
    
    // 如果有其他字段需要更新，调用 onUpdate
    if (Object.keys(updates).length > 0) {
      console.info("[dgrrb] TaskCreateDialog: updating additional fields", updates);
      await props.onUpdate(rowId, updates);
    }
    
    console.info("[dgrrb] TaskCreateDialog: task created successfully");
    showMessage("创建任务成功", 2000, "info");
    handleCancel();
  } catch (e: any) {
    console.error("[dgrrb] TaskCreateDialog: create error:", e);
    showMessage(`创建失败: ${e.message || String(e)}`, 5000, "error");
  } finally {
    creating.value = false;
  }
}

function handleCancel() {
  if (props.onClose) {
    props.onClose();
  }
}

onMounted(() => {
  console.info("[dgrrb] TaskCreateDialog mounted, initializing fields...");
  console.info("[dgrrb] Props:", {
    avID: props.avID,
    hasRawData: !!props.rawData,
    keyTypeCount: Object.keys(props.keyTypeById).length,
    parentTaskId: props.parentTaskId,
  });
  initializeFields();
  console.info("[dgrrb] TaskCreateDialog fields initialized, count:", fields.value.length);
});
</script>

<style scoped lang="scss">
.dgrrb-task-detail-dialog {
  padding: 16px;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}

.dgrrb-task-detail-header {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--b3-border-color);
}

.dgrrb-task-detail-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.dgrrb-task-detail-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dgrrb-task-detail-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dgrrb-task-detail-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--b3-theme-on-surface);
}

.dgrrb-task-detail-input {
  width: 100%;
}

.dgrrb-mselect-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--b3-border-color);
  border-radius: var(--b3-border-radius);
  background: var(--b3-theme-surface);
}

.dgrrb-mselect-option {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  
  input[type="checkbox"] {
    cursor: pointer;
  }
}

.dgrrb-task-detail-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--b3-theme-on-surface);
  opacity: 0.6;
}

.dgrrb-task-detail-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--b3-border-color);
}
</style>
