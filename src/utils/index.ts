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
export function buildValue(keyType: string | undefined, input: any, isNotTime: boolean = true) {
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
      // 处理日期时间输入：如果是 datetime-local 格式，需要正确解析
      let dateContent = 0;
      if (input) {
        const dateStr = String(input);
        // 如果是 datetime-local 格式（包含时间），直接解析
        // 如果是 date 格式（只有日期），添加时间部分
        const date = dateStr.includes("T") 
          ? new Date(dateStr)
          : new Date(`${dateStr}T00:00:00`);
        dateContent = date.getTime();
      }
      return {
        date: {
          content: dateContent,
          isNotEmpty: input !== undefined && input !== null && input !== "",
          hasEndDate: false,
          isNotTime: isNotTime,
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