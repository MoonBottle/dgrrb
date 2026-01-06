import { defineStore } from "pinia";
import type { Plugin } from "siyuan";
import type { TaskAvConfig, DatabaseConfig } from "@/domain/task";

export const useConfigStore = defineStore("config", {
  state: () => ({
    currentConfig: null as TaskAvConfig | null,
    dbName: "",
    dbId: "",
    configs: [] as DatabaseConfig[],
    plugin: null as Plugin | null,
  }),

  actions: {
    init(plugin: Plugin) {
      this.plugin = plugin;
    },

    async loadAllConfigs() {
      if (!this.plugin) {
        console.error("[dgrrb] configStore: plugin not initialized");
        return;
      }

      try {
        const configs = await this.plugin.loadData("task-av-configs").catch(() => null) as DatabaseConfig[] | null;
        this.configs = configs || [];
      } catch (e: any) {
        console.error("[dgrrb] configStore: loadAllConfigs error", e);
        this.configs = [];
      }
    },

    async loadConfig(dbId?: string) {
      if (!this.plugin) {
        console.error("[dgrrb] configStore: plugin not initialized");
        return;
      }

      await this.loadAllConfigs();

      if (dbId) {
        const db = this.configs.find(c => c.id === dbId);
        if (db) {
          this.currentConfig = db.config;
          this.dbName = db.name;
          this.dbId = db.id;
          return;
        } else {
          console.warn("[dgrrb] configStore: Database not found for dbId:", dbId);
        }
      }

      // Fallback to old config (for backward compatibility)
      const saved = await this.plugin.loadData("task-av-config").catch(() => null) as TaskAvConfig | null;
      this.currentConfig = saved;
      this.dbName = "";
      this.dbId = "";
    },

    async setConfig(config: TaskAvConfig, dbName?: string, dbId?: string) {
      if (!this.plugin) {
        console.error("[dgrrb] configStore: plugin not initialized");
        return;
      }

      this.currentConfig = config;

      if (dbId && dbName) {
        // 更新或添加数据库配置
        await this.loadAllConfigs();
        const existingIndex = this.configs.findIndex(db => db.id === dbId);
        const dbConfig: DatabaseConfig = {
          id: dbId,
          name: dbName,
          config,
        };

        if (existingIndex >= 0) {
          this.configs[existingIndex] = dbConfig;
        } else {
          this.configs.push(dbConfig);
        }

        await this.plugin.saveData("task-av-configs", this.configs);
        this.dbName = dbName;
        this.dbId = dbId;
      } else {
        // 保存旧格式配置
        await this.plugin.saveData("task-av-config", config);
        this.dbName = "";
        this.dbId = "";
      }
    },
  },
});
