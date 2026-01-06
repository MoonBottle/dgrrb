<template>
  <div class="dgrrb-task-detail-dialog">
    <div class="dgrrb-task-detail-header">
      <div class="dgrrb-task-detail-title">{{ defaultType === '成果' ? '创建成果' : '创建任务' }}</div>
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
            :type="enableDateTime ? 'datetime-local' : 'date'"
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
import { buildValue } from "@/utils";
import { useTaskStore } from "@/stores/taskStore";
import { useConfigStore } from "@/stores/configStore";

const props = defineProps<{
  parentTaskId?: string;
  defaultType?: string; // 默认类型（"任务"或"成果"）
  enableDateTime?: boolean; // 是否启用日期时间输入（支持时分）
  onCreate: (payload: { text: string; parent?: string; start_date: Date; duration: number; fields?: Record<string, any> }) => Promise<string>;
  onUpdate: (itemID: string, updates: Record<string, any>) => Promise<void>;
  onClose?: () => void;
}>();

const taskStore = useTaskStore();
const configStore = useConfigStore();

const fields = ref<Array<{
  keyID: string;
  name: string;
  type: string;
  options?: any[];
}>>([]);

const fieldValues = ref<Record<string, any>>({});
const creating = ref(false);


// 初始化字段列表
function initializeFields() {
  console.info("[dgrrb] TaskCreateDialog: initializeFields called");
  
  const config = configStore.currentConfig;
  if (!config) {
    console.warn("[dgrrb] TaskCreateDialog: config not found");
    return;
  }
  
  // 从 store 获取字段定义
  fields.value = taskStore.tableData.columns.map((col) => ({
    keyID: col.keyID,
    name: col.name,
    type: col.type,
    options: col.options || [],
  }));
  
  console.info("[dgrrb] TaskCreateDialog: fields built", fields.value);
  
  // 初始化字段值为空
  const values: Record<string, any> = {};
  for (const field of fields.value) {
    values[field.keyID] = "";
  }
  
  // 设置默认值
  if (props.enableDateTime) {
    // 成果创建：结束时间为当前时间，开始时间为当前时间往前推1小时
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // 格式化为 datetime-local 格式 (YYYY-MM-DDTHH:mm)
    const formatDateTimeLocal = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };
    
    if (config.startKeyID) {
      values[config.startKeyID] = formatDateTimeLocal(oneHourAgo);
    }
    if (config.endKeyID) {
      values[config.endKeyID] = formatDateTimeLocal(now);
    }
  } else {
    // 任务创建：使用今天的日期
    const today = new Date().toISOString().slice(0, 10);
    if (config.startKeyID) {
      values[config.startKeyID] = today;
    }
    if (config.endKeyID) {
      values[config.endKeyID] = today;
    }
  }
  if (props.parentTaskId && config.parentKeyID) {
    values[config.parentKeyID] = props.parentTaskId;
  }
  
  // 设置状态默认值为"进行中"
  if (config.statusKeyID) {
    const statusField = fields.value.find(f => f.keyID === config.statusKeyID);
    if (statusField) {
      // 查找"进行中"选项
      const inProgressOption = statusField.options?.find((opt: any) => {
        const optName = opt.name || opt.content || "";
        return optName === "进行中" || optName.toLowerCase().includes("进行中");
      });
      if (inProgressOption) {
        values[config.statusKeyID] = inProgressOption.name || inProgressOption.content || "进行中";
      } else {
        // 如果没有找到，直接使用"进行中"
        values[config.statusKeyID] = "进行中";
      }
    }
  }
  
  // 设置类型默认值（根据 defaultType prop，默认为"任务"）
  if (config.typeKeyID) {
    const typeField = fields.value.find(f => f.keyID === config.typeKeyID);
    if (typeField) {
      const targetType = props.defaultType || "任务";
      // 查找目标类型选项
      const typeOption = typeField.options?.find((opt: any) => {
        const optName = opt.name || opt.content || "";
        return optName === targetType || optName.toLowerCase().includes(targetType.toLowerCase());
      });
      if (typeOption) {
        values[config.typeKeyID] = typeOption.name || typeOption.content || targetType;
      } else {
        // 如果没有找到，直接使用目标类型
        values[config.typeKeyID] = targetType;
      }
    }
  }
  
  // 设置进度默认值为0
  if (config.progressKeyID) {
    values[config.progressKeyID] = 0;
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
    
    // 收集所有字段的值（用于成果创建时一次性设置）
    const allFields: Record<string, any> = {};
    for (const field of fields.value) {
      const value = fieldValues.value[field.keyID];
      if (value !== undefined && value !== null && value !== "") {
        allFields[field.keyID] = value;
      }
    }
    
    const config = configStore.currentConfig;
    if (!config) {
      showMessage("配置缺失", 3000, "error");
      creating.value = false;
      return;
    }
    
    // 提取开始日期和结束日期
    const startDateStr = config.startKeyID ? fieldValues.value[config.startKeyID] : "";
    const endDateStr = config.endKeyID ? fieldValues.value[config.endKeyID] : "";
    
    // 处理日期时间：如果是 datetime-local 格式（包含时间），直接解析；否则添加时间部分
    let startDate: Date;
    let endDate: Date;
    if (startDateStr) {
      startDate = startDateStr.includes("T") ? new Date(startDateStr) : new Date(`${startDateStr}T00:00:00`);
    } else {
      startDate = new Date();
    }
    if (endDateStr) {
      endDate = endDateStr.includes("T") ? new Date(endDateStr) : new Date(`${endDateStr}T00:00:00`);
    } else {
      endDate = startDate;
    }
    
    // 计算持续时间（天数，包含开始和结束日期）
    const duration = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1);
    
    // 提取父任务 ID
    const parentId = config.parentKeyID ? fieldValues.value[config.parentKeyID] : props.parentTaskId;
    
    // 调用 onCreate 创建任务/成果
    console.info("[dgrrb] TaskCreateDialog: creating", props.enableDateTime ? "outcome" : "task", {
      text: taskName,
      parent: parentId,
      start_date: startDate,
      duration,
      fields: props.enableDateTime ? allFields : undefined,
    });
    
    const itemID = await props.onCreate({
      text: taskName,
      parent: parentId,
      start_date: startDate,
      duration,
      fields: props.enableDateTime ? allFields : undefined, // 成果创建时传递所有字段
    });
    
    if (!itemID) {
      showMessage(`创建${props.enableDateTime ? "成果" : "任务"}失败：未返回 ID`, 5000, "error");
      creating.value = false;
      return;
    }
    
    console.info("[dgrrb] TaskCreateDialog:", props.enableDateTime ? "outcome" : "task", "created, itemID:", itemID);
    
    // 如果是成果创建（enableDateTime 为 true），直接传递所有字段给 onCreate
    if (props.enableDateTime) {
      // 成果创建：所有字段已在 onCreate 中处理，不需要额外更新
      console.info("[dgrrb] TaskCreateDialog: outcome created with all fields", allFields);
      console.info("[dgrrb] TaskCreateDialog: outcome created successfully");
      showMessage("创建成果成功", 2000, "info");
      handleCancel();
    } else {
      // 任务创建：构建其他字段的更新（排除已在创建时设置的字段）
      const updates: Record<string, any> = {};
      
      for (const field of fields.value) {
        // 跳过主键 block 字段（已经在创建时设置）
        if (field.type === "block") {
          continue;
        }
        
        // 跳过开始日期和结束日期（已经在创建时设置）
        if (field.keyID === config.startKeyID || field.keyID === config.endKeyID) {
          continue;
        }
        
        // 跳过父任务（如果已经在创建时设置）
        if (field.keyID === config.parentKeyID && parentId) {
          continue;
        }
        
        const value = fieldValues.value[field.keyID];
        if (value !== undefined && value !== null && value !== "") {
          const keyType = taskStore.keyTypeById[field.keyID];
          updates[field.keyID] = buildValue(keyType, value, true); // 任务创建时 isNotTime: true
        }
      }
      
      // 如果有其他字段需要更新，调用 onUpdate
      if (Object.keys(updates).length > 0) {
        console.info("[dgrrb] TaskCreateDialog: updating additional fields", updates);
        await props.onUpdate(itemID, updates);
      }
      
      console.info("[dgrrb] TaskCreateDialog: task created successfully");
      showMessage("创建任务成功", 2000, "info");
      handleCancel();
    }
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
    parentTaskId: props.parentTaskId,
    defaultType: props.defaultType,
    enableDateTime: props.enableDateTime,
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
