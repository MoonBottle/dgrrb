import { defineStore } from "pinia";
import { useTaskStore } from "./taskStore";
import { useConfigStore } from "./configStore";

export const useReportStore = defineStore("report", {
  state: () => ({
    reportFrom: new Date().toISOString().slice(0, 10),
    reportTo: new Date().toISOString().slice(0, 10),
    reportMd: "",
  }),

  actions: {
    setReportRange(from: string, to: string) {
      this.reportFrom = from;
      this.reportTo = to;
    },

    generateReport() {
      const taskStore = useTaskStore();
      const configStore = useConfigStore();
      const config = configStore.currentConfig;
      
      if (!config) {
        this.reportMd = "";
        return;
      }

      const from = this.reportFrom;
      const to = this.reportTo;
      const done: any[] = [];
      const pending: any[] = [];

      // 判断是否完成状态
      const isDoneStatus = (s?: string) => {
        if (!s)
          return false;
        return /done|完成|已完成|finished/i.test(s);
      };

      // 当前实现：按状态粗分；日期范围暂用于标题/筛选（若任务 start/end 在范围内则纳入）
      const inRange = (t: any) => {
        if (!from || !to)
          return true;
        const s = t.start || "0000-00-00";
        const e = t.end || "9999-12-31";
        return !(e < from || s > to);
      };

      // 从 taskStore 获取筛选后的任务（转换为 Task 格式）
      const filteredRows = taskStore.getFilteredRows;
      for (const row of filteredRows) {
        const startCell = config.startKeyID ? row.cells[config.startKeyID] : undefined;
        const endCell = config.endKeyID ? row.cells[config.endKeyID] : undefined;
        const statusCell = config.statusKeyID ? row.cells[config.statusKeyID] : undefined;

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

        // 提取标题
        const blockColumn = taskStore.tableData.columns.find(c => c.type === "block");
        const titleCell = blockColumn ? row.cells[blockColumn.keyID] : undefined;
        const title = titleCell?.text || row.itemID;

        const task = {
          docId: row.itemID,
          title,
          start: normalizeDate(startCell?.value),
          end: normalizeDate(endCell?.value),
          status: statusCell?.text,
        };

        if (!inRange(task))
          continue;
        (isDoneStatus(task.status) ? done : pending).push(task);
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

      this.reportMd = lines.join("\n");
    },

    async copyReport() {
      if (!this.reportMd)
        return false;
      try {
        await navigator.clipboard.writeText(this.reportMd);
        return true;
      } catch (e) {
        console.warn(e);
        return false;
      }
    },
  },
});
