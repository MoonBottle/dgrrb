<template>
  <div class="dgrrb-task-detail-dialog">
    <div class="dgrrb-task-detail-header">
      <div class="dgrrb-task-detail-title">任务详情</div>
      <div class="dgrrb-task-detail-id">记录 ID: {{ rowId }}</div>
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
      <div style="margin-top: 8px; font-size: 12px; opacity: 0.7;">
        rowId: {{ rowId }}<br/>
        keyTypeById keys: {{ Object.keys(taskStore.keyTypeById || {}).length }}
      </div>
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
        @click="handleSave"
        :disabled="saving"
      >
        {{ saving ? '保存中...' : '保存' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { showMessage } from "siyuan";
import { valueToText } from "@/domain/task";
import { buildValue } from "@/utils";
import { useTaskStore } from "@/stores/taskStore";

const props = defineProps<{
  rowId: string;
  onSaved?: () => void;
  onClose?: () => void;
}>();

const taskStore = useTaskStore();

const fields = ref<Array<{
  keyID: string;
  name: string;
  type: string;
  options?: any[];
}>>([]);

const fieldValues = ref<Record<string, any>>({});
const saving = ref(false);


// 从 tableData 中获取行数据
function getRowFromTableData(itemID: string) {
  return taskStore.tableData.rows.find(row => row.itemID === itemID);
}

// 从行数据中提取字段值
function extractFieldValue(row: any, keyID: string): any {
  if (!row || !keyID) {
    return "";
  }
  
  const cell = row.cells[keyID];
  if (!cell || !cell.value) {
    return "";
  }
  
  const value = cell.value;
  const keyType = taskStore.keyTypeById[keyID];
  
  if (keyType === "block" && value?.block) {
    // block 类型：直接使用 block.content
    return value.block.content || "";
  }
  
  if (keyType === "date" && value?.date?.content) {
    const date = new Date(value.date.content);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  
  if (keyType === "number" && value?.number?.content !== undefined) {
    return value.number.content;
  }
  
  if ((keyType === "select" || keyType === "mSelect") && value?.mSelect) {
    if (Array.isArray(value.mSelect)) {
      if (keyType === "select") {
        return value.mSelect[0]?.content || value.mSelect[0]?.name || "";
      } else {
        // 多选：返回数组，用于 multiple select
        return value.mSelect.map((v: any) => v.content || v.name || v);
      }
    }
    return keyType === "mSelect" ? [] : "";
  }
  
  if (keyType === "relation" && value?.relation) {
    if (Array.isArray(value.relation) && value.relation.length > 0) {
      return value.relation[0].content || value.relation[0].id || "";
    }
    return "";
  }
  
  // 默认使用 text
  return cell.text || valueToText(value);
}

// 初始化字段列表和值
function initializeFields() {
  console.info("[dgrrb] TaskDetailDialog: initializeFields called");
  
  const row = getRowFromTableData(props.rowId);
  
  if (!row) {
    console.warn("[dgrrb] TaskDetailDialog: row not found for itemID:", props.rowId);
    return;
  }
  
  console.info("[dgrrb] TaskDetailDialog: row found", row);
  
  // 从 store 获取字段定义
  fields.value = taskStore.tableData.columns.map((col) => ({
    keyID: col.keyID,
    name: col.name,
    type: col.type,
    options: col.options || [],
  }));
  
  console.info("[dgrrb] TaskDetailDialog: fields built", fields.value);
  
  // 初始化字段值
  const values: Record<string, any> = {};
  for (const field of fields.value) {
    values[field.keyID] = extractFieldValue(row, field.keyID);
  }
  fieldValues.value = values;
  
  console.info("[dgrrb] TaskDetailDialog: initialized", {
    fieldCount: fields.value.length,
    rowId: props.rowId,
    fieldValues: fieldValues.value,
  });
}

// 保存更改
async function handleSave() {
  if (saving.value) {
    return;
  }
  
  saving.value = true;
  
  try {
    // 构建更新对象
    const updates: Record<string, any> = {};
    
    for (const field of fields.value) {
      const newValue = fieldValues.value[field.keyID];
      const keyType = taskStore.keyTypeById[field.keyID];
      
      // 构建值对象
      const valueObj = buildValue(keyType, newValue);
      updates[field.keyID] = valueObj;
    }
    
    if (Object.keys(updates).length === 0) {
      showMessage("没有需要保存的更改", 3000, "info");
      saving.value = false;
      return;
    }
    
    console.info(`[dgrrb] TaskDetailDialog: saving ${Object.keys(updates).length} fields for itemID ${props.rowId}`, updates);
    
    // 使用 store 的 updateFields 方法
    await taskStore.updateFields(props.rowId, updates);
    
    console.info(`[dgrrb] TaskDetailDialog: save success`);
    showMessage("保存成功", 2000, "info");
    if (props.onSaved) {
      props.onSaved();
    }
    handleCancel();
  } catch (e: any) {
    console.error(`[dgrrb] TaskDetailDialog: save error:`, e);
    showMessage(`保存失败: ${e.message || String(e)}`, 5000, "error");
  } finally {
    saving.value = false;
  }
}

function handleCancel() {
  if (props.onClose) {
    props.onClose();
  }
}

onMounted(() => {
  console.info("[dgrrb] TaskDetailDialog mounted, initializing fields...");
  console.info("[dgrrb] Props:", {
    rowId: props.rowId,
  });
  initializeFields();
  console.info("[dgrrb] TaskDetailDialog fields initialized, count:", fields.value.length);
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

.dgrrb-task-detail-id {
  font-size: 12px;
  opacity: 0.7;
  font-family: monospace;
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

