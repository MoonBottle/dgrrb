import { createApp } from 'vue';

export function getDomByVueComponent(component) {
  const div = document.createElement('div');
  const app = createApp(component);
  app.mount(div);
  return div;
}

/**
 * 构建属性视图字段值的函数
 * 将用户输入转换为思源 API 所需的格式
 */
export function buildValue(keyType: string | undefined, input: any) {
  switch (keyType) {
    case "block":
      return { block: { content: String(input ?? "") } };
    case "number":
      const numValue = Number(input) || 0;
      return {
        number: {
          content: numValue,
          isNotEmpty: input !== undefined && input !== null && input !== "",
          format: "",
          formattedContent: String(numValue),
        },
      };
    case "select":
      return { mSelect: input ? [{ content: String(input) }] : [] };
    case "mSelect":
      // 多选：input 可能是数组或逗号分隔的字符串
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