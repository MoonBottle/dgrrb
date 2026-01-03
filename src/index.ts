import {
  Plugin,
  getFrontend,
  Setting,
  showMessage,
  openTab,
  confirm,
} from "siyuan";
import "@/index.scss";
import PluginInfoString from '@/../plugin.json'
import { getAttributeView, getAttributeViewKeysByAvID, addAttributeViewKey } from "@/api";
import { createApp } from "vue";
import TaskGanttApp from "@/ui/TaskGanttApp.vue";
import type { DatabaseConfig, TaskAvConfig } from "@/domain/task";

function toArray(maybeArr: any): any[] {
  if (Array.isArray(maybeArr))
    return maybeArr;
  if (maybeArr && typeof maybeArr === "object")
    return Object.values(maybeArr);
  return [];
}

function normalizeAvKeys(res: any): any[] {
  // Try fast paths first
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

function normalizeAvViews(res: any): any[] {
  const direct = res?.views ?? res?.data?.views ?? res?.data ?? res;
  const arr = toArray(direct);
  if (arr.length)
    return arr;

  // Deep search fallback: find the first array that looks like AV views
  const seen = new Set<any>();
  const queue: any[] = [res];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || seen.has(cur))
      continue;
    seen.add(cur);
    if (Array.isArray(cur)) {
      if (cur.length && cur.every((x: any) => x && typeof x === "object" && "id" in x && ("name" in x || "type" in x || "layoutType" in x)))
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

let PluginInfo = {
  version: '',
}
try {
  PluginInfo = PluginInfoString
} catch (err) {
  console.log('Plugin info parse error: ', err)
}
const {
  version,
} = PluginInfo

export default class PluginSample extends Plugin {
  // Run as mobile
  public isMobile: boolean
  // Run in browser
  public isBrowser: boolean
  // Run as local
  public isLocal: boolean
  // Run in Electron
  public isElectron: boolean
  // Run in window
  public isInWindow: boolean
  public platform: SyFrontendTypes
  public readonly version = version
  private readonly storageKeyAvConfigs = "task-av-configs";
  private readonly tabTypeTaskGantt = "task-gantt";
  private dockModel: any = null;

  async onload() {
    const frontEnd = getFrontend();
    this.platform = frontEnd as SyFrontendTypes
    this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile"
    this.isBrowser = frontEnd.includes('browser')
    this.isLocal =
      location.href.includes('127.0.0.1')
      || location.href.includes('localhost')
    this.isInWindow = location.href.includes('window.html')

    try {
      require("@electron/remote")
        .require("@electron/remote/main")
      this.isElectron = true
    } catch (err) {
      this.isElectron = false
    }

    console.log('Plugin loaded, the plugin is ', this)

    // Create Dock for database management
    this.createDock();

    // Plugin Setting
    this.setting = new Setting({
      width: "980px",
      confirmCallback: async () => {
        const els = (this as any)._taskAvSettingEls as {
          dbId?: string;
          dbName?: HTMLInputElement;
          avID?: HTMLInputElement;
          viewID?: HTMLSelectElement;
          startKeyID?: HTMLSelectElement;
          endKeyID?: HTMLSelectElement;
          statusKeyID?: HTMLSelectElement;
          parentKeyID?: HTMLSelectElement;
          progressKeyID?: HTMLSelectElement;
          typeKeyID?: HTMLSelectElement;
        } | undefined;

        if (!els?.avID) {
          showMessage("设置项尚未初始化", 5000, "error");
          return;
        }

        const payload: TaskAvConfig = {
          avID: els.avID.value.trim(),
          viewID: els.viewID?.value?.trim() || "",
          startKeyID: els.startKeyID?.value?.trim() || "",
          endKeyID: els.endKeyID?.value?.trim() || "",
          statusKeyID: els.statusKeyID?.value?.trim() || "",
          parentKeyID: els.parentKeyID?.value?.trim() || "",
          progressKeyID: els.progressKeyID?.value?.trim() || "",
          typeKeyID: els.typeKeyID?.value?.trim() || "",
        };

        if (!payload.avID) {
          showMessage("请先填写 avID", 5000, "error");
          return;
        }

        const dbName = els.dbName?.value.trim() || payload.avID;
        const dbId = els.dbId || this.generateId();

        const configs = await this.getDatabaseConfigs();
        const existingIndex = configs.findIndex(db => db.id === dbId);
        
        const dbConfig: DatabaseConfig = {
          id: dbId,
          name: dbName,
          config: payload,
        };

        if (existingIndex >= 0) {
          configs[existingIndex] = dbConfig;
          showMessage("已更新任务数据库配置", 4000, "info");
        } else {
          configs.push(dbConfig);
          showMessage("已添加任务数据库配置", 4000, "info");
        }

        await this.saveData(this.storageKeyAvConfigs, configs);
        this.refreshDock();
        this.setting.close();
      },
    });

    this.setting.addItem({
      title: "任务数据库（AV）配置",
      direction: "column",
      description: "绑定已有属性视图（数据库），并选择关键列（开始/结束/状态/父任务/进度）",
      createActionElement: () => {
        return this.createSettingElement();
      },
    });

    // Register custom tab (Task Gantt)
    const plugin = this;
    this.addTab({
      type: this.tabTypeTaskGantt,
      init(this: any) {
        console.log("[dgrrb] Tab init called", this);
        // this -> Custom
        const container = document.createElement("div");
        container.className = "dgrrb-taskgantt-root";
        (this.element as HTMLElement).appendChild(container);
        
        // Get database ID from custom.data
        const dbId = (this.data as any)?.dbId;
        console.log("[dgrrb] Tab init, dbId:", dbId, "data:", this.data);
        
        const app = createApp(TaskGanttApp, {
          plugin,
          dbId: dbId,
        });
        app.mount(container);
        this._vueApp = app;
        this._vueContainer = container;
        this._dbId = dbId;
        
        console.log("[dgrrb] Vue app mounted, container:", container);
        
        // Store reference to component instance and reload function for update callback
        setTimeout(() => {
          const rootElement = container.querySelector('.dgrrb-taskgantt');
          if (rootElement) {
            this._componentInstance = (rootElement as any).__vueParentComponent;
            console.log("[dgrrb] Component instance stored:", this._componentInstance);
            
            // Try to get reload function directly
            if (this._componentInstance && this._componentInstance.exposed) {
              this._reloadFn = this._componentInstance.exposed.reload;
              console.log("[dgrrb] Reload function stored:", typeof this._reloadFn);
            }
          } else {
            console.warn("[dgrrb] Component root element not found");
          }
          
          // Listen for visibility changes to detect tab switching using IntersectionObserver
          if (this.element) {
            const intersectionObserver = new IntersectionObserver((entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting && entry.intersectionRatio > 0) {
                  // Tab became visible
                  if (this._wasHidden) {
                    console.log("[dgrrb] Tab became visible (IntersectionObserver), reloading...");
                    console.log("[dgrrb] _reloadFn:", typeof this._reloadFn, this._reloadFn);
                    console.log("[dgrrb] _componentInstance:", this._componentInstance);
                    this._wasHidden = false;
                    
                    // Try multiple methods to call reload
                    let reloaded = false;
                    
                    if (this._reloadFn && typeof this._reloadFn === 'function') {
                      console.log("[dgrrb] Calling stored _reloadFn");
                      try {
                        this._reloadFn();
                        reloaded = true;
                      } catch (e) {
                        console.error("[dgrrb] Error calling _reloadFn:", e);
                      }
                    }
                    
                    if (!reloaded && this._componentInstance && this._componentInstance.exposed) {
                      if (typeof this._componentInstance.exposed.reload === 'function') {
                        console.log("[dgrrb] Calling reload from component instance");
                        try {
                          this._componentInstance.exposed.reload();
                          reloaded = true;
                        } catch (e) {
                          console.error("[dgrrb] Error calling component reload:", e);
                        }
                      }
                    }
                    
                    // Fallback: try to find from DOM again
                    if (!reloaded && this._vueContainer) {
                      const rootElement = this._vueContainer.querySelector('.dgrrb-taskgantt');
                      if (rootElement) {
                        const component = (rootElement as any).__vueParentComponent;
                        if (component && component.exposed && typeof component.exposed.reload === 'function') {
                          console.log("[dgrrb] Calling reload from DOM component");
                          try {
                            component.exposed.reload();
                            reloaded = true;
                          } catch (e) {
                            console.error("[dgrrb] Error calling DOM component reload:", e);
                          }
                        }
                      }
                    }
                    
                    // Last resort: click the reload button
                    if (!reloaded && this._vueContainer) {
                      const reloadBtn = this._vueContainer.querySelector('.dgrrb-taskgantt__actions button');
                      if (reloadBtn && (reloadBtn as HTMLElement).textContent?.includes('刷新')) {
                        console.log("[dgrrb] Clicking reload button as fallback");
                        (reloadBtn as HTMLElement).click();
                      } else {
                        console.warn("[dgrrb] Could not find reload button");
                      }
                    }
                  }
                } else {
                  // Tab became hidden
                  this._wasHidden = true;
                }
              });
            }, {
              threshold: [0, 0.1, 1.0] // Trigger at 0%, 10%, and 100% visibility
            });
            
            intersectionObserver.observe(this.element as HTMLElement);
            this._visibilityObserver = intersectionObserver;
            
            // Also check initial visibility
            const rect = (this.element as HTMLElement).getBoundingClientRect();
            this._wasHidden = !(rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0);
          }
        }, 100);
      },
      update(this: any) {
        console.log("[dgrrb] Tab update called");
        // Refresh when tab is switched back
        // Method 1: Use stored reload function
        if (this._reloadFn && typeof this._reloadFn === 'function') {
          console.log("[dgrrb] Calling stored reload function");
          this._reloadFn();
          return;
        }
        
        // Method 2: Use stored component instance
        if (this._componentInstance && this._componentInstance.exposed) {
          if (typeof this._componentInstance.exposed.reload === 'function') {
            console.log("[dgrrb] Calling reload from stored component instance");
            this._componentInstance.exposed.reload();
            return;
          }
        }
        
        // Method 3: Find from DOM
        if (this._vueContainer) {
          const rootElement = this._vueContainer.querySelector('.dgrrb-taskgantt');
          if (rootElement) {
            const component = (rootElement as any).__vueParentComponent;
            if (component && component.exposed && typeof component.exposed.reload === 'function') {
              console.log("[dgrrb] Calling reload from DOM component");
              component.exposed.reload();
              return;
            }
          }
        }
        
        console.warn("[dgrrb] Could not find reload method");
      },
      destroy(this: any) {
        try {
          this._vueApp?.unmount?.();
        } catch (e) {
          console.warn(e);
        }
        try {
          this._vueContainer?.remove?.();
        } catch (e) {
          console.warn(e);
        }
        if (this._visibilityObserver) {
          this._visibilityObserver.disconnect();
          this._visibilityObserver = null;
        }
        this._vueApp = null;
        this._vueContainer = null;
        this._dbId = null;
        this._componentInstance = null;
        this._reloadFn = null;
        this._wasHidden = false;
      },
    });
  }

  onunload() {
    // Tab lifecycle is handled by Siyuan Custom destroy hooks
  }

  openSetting(dbId?: string) {
    if (dbId) {
      // Edit mode
      this.openSettingForDatabase(dbId);
    } else {
      // New mode
      this.setting.open(this.name);
      // Clear form
      setTimeout(() => {
        const els = (this as any)._taskAvSettingEls;
        if (els) {
          els.dbId = undefined;
          if (els.dbName) els.dbName.value = "";
          if (els.avID) els.avID.value = "";
          if (els.viewID) els.viewID.value = "";
          if (els.startKeyID) els.startKeyID.value = "";
          if (els.endKeyID) els.endKeyID.value = "";
          if (els.statusKeyID) els.statusKeyID.value = "";
          if (els.parentKeyID) els.parentKeyID.value = "";
          if (els.progressKeyID) els.progressKeyID.value = "";
          if (els.typeKeyID) els.typeKeyID.value = "";
        }
      }, 100);
    }
  }

  private async openSettingForDatabase(dbId: string) {
    const configs = await this.getDatabaseConfigs();
    const db = configs.find(c => c.id === dbId);
    if (!db) {
      showMessage("数据库配置不存在", 5000, "error");
      return;
    }

    this.setting.open(this.name);
    setTimeout(() => {
      const els = (this as any)._taskAvSettingEls;
      if (els) {
        els.dbId = dbId;
        if (els.dbName) els.dbName.value = db.name;
        if (els.avID) els.avID.value = db.config.avID;
        if (els.viewID) els.viewID.value = db.config.viewID || "";
        if (els.startKeyID) els.startKeyID.value = db.config.startKeyID || "";
        if (els.endKeyID) els.endKeyID.value = db.config.endKeyID || "";
        if (els.statusKeyID) els.statusKeyID.value = db.config.statusKeyID || "";
        if (els.parentKeyID) els.parentKeyID.value = db.config.parentKeyID || "";
        if (els.progressKeyID) els.progressKeyID.value = db.config.progressKeyID || "";
        if (els.typeKeyID) els.typeKeyID.value = db.config.typeKeyID || "";
      }
    }, 100);
  }

  private async getDatabaseConfigs(): Promise<DatabaseConfig[]> {
    const configs = await this.loadData(this.storageKeyAvConfigs).catch(() => null) as DatabaseConfig[] | null;
    return configs || [];
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async openGanttTab(dbId: string) {
    const configs = await this.getDatabaseConfigs();
    const db = configs.find(c => c.id === dbId);
    if (!db) {
      showMessage("数据库配置不存在", 5000, "error");
      return;
    }

    // Tab ID must be plugin.name + tab.type (according to API)
    const baseTabId = `${this.name}${this.tabTypeTaskGantt}`;
    
    // Check if tab already exists
    const openedTabs = this.getOpenedTab();
    const existingTab = Object.values(openedTabs).flat().find((tab: any) => 
      tab.type === this.tabTypeTaskGantt && (tab.data as any)?.dbId === dbId
    );

    console.log("[dgrrb] openGanttTab, dbId:", dbId, "existingTab:", existingTab);

    if (existingTab) {
      // Switch to existing tab
      openTab({
        app: this.app,
        custom: {
          id: baseTabId,
          icon: "iconCalendar",
          title: db.name,
          data: { dbId },
        },
      });
    } else {
      // Create new tab
      openTab({
        app: this.app,
        custom: {
          id: baseTabId,
          icon: "iconCalendar",
          title: db.name,
          data: { dbId },
        },
        openNewTab: true,
      });
    }
  }

  private createDock() {
    const plugin = this;
    this.dockModel = this.addDock({
      config: {
        position: "LeftTop",
        size: { width: 200, height: 0 },
        icon: "iconDatabase",
        title: "任务数据库管理",
      },
      data: {},
      type: "database-manager",
      init(this: any, dock: any) {
        plugin.initDockContent(dock);
      },
    });
  }

  private async initDockContent(dock: any) {
    if (!dock || !dock.element) {
      console.error("[dgrrb] dock element not found");
      return;
    }
    const container = dock.element.querySelector('.b3-dock__content') || dock.element;
    if (!container) {
      console.error("[dgrrb] dock content container not found");
      return;
    }
    container.innerHTML = "";
    container.style.padding = "8px";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "8px";

    const addBtn = document.createElement("button");
    addBtn.className = "b3-button b3-button--small";
    addBtn.textContent = "添加数据库";
    addBtn.style.width = "100%";
    addBtn.onclick = () => {
      this.openSetting();
    };
    container.appendChild(addBtn);

    const listContainer = document.createElement("div");
    listContainer.className = "dgrrb-dock-database-list";
    listContainer.style.display = "flex";
    listContainer.style.flexDirection = "column";
    listContainer.style.gap = "4px";
    container.appendChild(listContainer);

    await this.renderDatabaseList(listContainer);
  }

  private async renderDatabaseList(container: HTMLElement) {
    container.innerHTML = "";
    const configs = await this.getDatabaseConfigs();

    if (configs.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "b3-chip";
      emptyMsg.textContent = "暂无数据库配置";
      emptyMsg.style.opacity = "0.6";
      container.appendChild(emptyMsg);
      return;
    }

    for (const db of configs) {
      const item = document.createElement("div");
      item.style.display = "flex";
      item.style.flexDirection = "column";
      item.style.gap = "4px";
      item.style.padding = "8px";
      item.style.border = "1px solid var(--b3-border-color)";
      item.style.borderRadius = "4px";
      item.style.cursor = "pointer";

      const nameRow = document.createElement("div");
      nameRow.style.display = "flex";
      nameRow.style.alignItems = "center";
      nameRow.style.justifyContent = "space-between";
      nameRow.style.fontWeight = "500";
      nameRow.textContent = db.name;
      nameRow.onclick = () => {
        this.openGanttTab(db.id);
      };
      item.appendChild(nameRow);

      const avIdRow = document.createElement("div");
      avIdRow.style.fontSize = "12px";
      avIdRow.style.opacity = "0.7";
      avIdRow.textContent = `avID: ${db.config.avID.substring(0, 20)}...`;
      item.appendChild(avIdRow);

      const actionsRow = document.createElement("div");
      actionsRow.style.display = "flex";
      actionsRow.style.gap = "4px";
      actionsRow.style.marginTop = "4px";

      const openBtn = document.createElement("button");
      openBtn.className = "b3-button b3-button--small";
      openBtn.textContent = "打开";
      openBtn.onclick = (e) => {
        e.stopPropagation();
        this.openGanttTab(db.id);
      };
      actionsRow.appendChild(openBtn);

      const editBtn = document.createElement("button");
      editBtn.className = "b3-button b3-button--small";
      editBtn.textContent = "编辑";
      editBtn.onclick = (e) => {
        e.stopPropagation();
        this.openSetting(db.id);
      };
      actionsRow.appendChild(editBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "b3-button b3-button--small b3-button--cancel";
      deleteBtn.textContent = "删除";
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        confirm(
          "删除数据库",
          `确定要删除数据库 "${db.name}" 吗？`,
          async () => {
            const configs = await this.getDatabaseConfigs();
            const filtered = configs.filter(c => c.id !== db.id);
            await this.saveData(this.storageKeyAvConfigs, filtered);
            this.refreshDock();
            showMessage("已删除数据库配置", 3000, "info");
          }
        );
      };
      actionsRow.appendChild(deleteBtn);

      item.appendChild(actionsRow);
      container.appendChild(item);
    }
  }

  private async refreshDock() {
    if (this.dockModel && this.dockModel.model) {
      const dock = this.dockModel.model;
      // Find the list container and refresh it
      const container = dock.element?.querySelector('.b3-dock__content') || dock.element;
      if (container) {
        const listContainer = container.querySelector('.dgrrb-dock-database-list');
        if (listContainer) {
          await this.renderDatabaseList(listContainer as HTMLElement);
          return;
        }
      }
      // If list container not found, reinitialize the entire dock content
      await this.initDockContent(dock);
    }
  }

  private createSettingElement(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "dgrrb-setting";
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "8px";
    wrap.style.width = "100%";

    const row = () => {
      const el = document.createElement("div");
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.gap = "8px";
      return el;
    };

    const label = (text: string) => {
      const el = document.createElement("div");
      el.textContent = text;
      el.style.minWidth = "140px";
      return el;
    };

    const input = () => {
      const el = document.createElement("input");
      el.className = "b3-text-field fn__flex-1";
      el.spellcheck = false;
      return el;
    };

    const select = () => {
      const el = document.createElement("select");
      el.className = "b3-select fn__flex-1";
      return el;
    };

    const option = (value: string, text: string) => {
      const el = document.createElement("option");
      el.value = value;
      el.textContent = text;
      return el;
    };

    const btn = (text: string) => {
      const el = document.createElement("button");
      el.className = "b3-button b3-button--small";
      el.type = "button";
      el.textContent = text;
      return el;
    };

    const dbNameRow = row();
    const dbName = input();
    dbName.placeholder = "数据库名称（可选）";
    dbNameRow.append(label("数据库名称"), dbName);

    const avIdRow = row();
    const avID = input();
    avID.placeholder = "输入任务数据库 avID（不是 blockID）";
    const loadBtn = btn("加载列/视图");
    const autoCreateBtn = btn("自动创建列");
    avIdRow.append(label("avID"), avID, loadBtn, autoCreateBtn);

    const viewRow = row();
    const viewID = select();
    viewID.append(option("", "（默认视图）"));
    viewRow.append(label("视图 viewID"), viewID);

    const startRow = row();
    const startKeyID = select();
    startKeyID.append(option("", "（不使用）"));
    startRow.append(label("开始日期 keyID"), startKeyID);

    const endRow = row();
    const endKeyID = select();
    endKeyID.append(option("", "（不使用）"));
    endRow.append(label("结束日期 keyID"), endKeyID);

    const statusRow = row();
    const statusKeyID = select();
    statusKeyID.append(option("", "（不使用）"));
    statusRow.append(label("状态 keyID"), statusKeyID);

    const parentRow = row();
    const parentKeyID = select();
    parentKeyID.append(option("", "（不使用）"));
    parentRow.append(label("父任务 relation keyID"), parentKeyID);

    const progressRow = row();
    const progressKeyID = select();
    progressKeyID.append(option("", "（不使用）"));
    progressRow.append(label("进度 number keyID"), progressKeyID);

    const typeRow = row();
    const typeKeyID = select();
    typeKeyID.append(option("", "（不使用）"));
    typeRow.append(label("类型 keyID"), typeKeyID);

    const setOptions = (sel: HTMLSelectElement, list: Array<{ value: string; text: string }>, first?: { value: string; text: string }) => {
      sel.innerHTML = "";
      if (first)
        sel.append(option(first.value, first.text));
      for (const it of list) {
        sel.append(option(it.value, it.text));
      }
    };

    const fillFromConfig = async () => {
      const els = (this as any)._taskAvSettingEls;
      if (!els) return;
      
      const dbId = els.dbId;
      if (dbId) {
        const configs = await this.getDatabaseConfigs();
        const db = configs.find(c => c.id === dbId);
        if (db) {
          if (dbName) dbName.value = db.name;
          if (avID) avID.value = db.config.avID;
          if (viewID) viewID.value = db.config.viewID || "";
          if (startKeyID) startKeyID.value = db.config.startKeyID || "";
          if (endKeyID) endKeyID.value = db.config.endKeyID || "";
          if (statusKeyID) statusKeyID.value = db.config.statusKeyID || "";
          if (parentKeyID) parentKeyID.value = db.config.parentKeyID || "";
          if (progressKeyID) progressKeyID.value = db.config.progressKeyID || "";
          if (typeKeyID) typeKeyID.value = db.config.typeKeyID || "";
        }
      }
    };

    const loadKeysAndViews = async () => {
      const id = avID.value.trim();
      if (!id) {
        showMessage("请先填写 avID", 5000, "error");
        return;
      }
      try {
        const av = await getAttributeView(id);
        const keys = await getAttributeViewKeysByAvID(id);

        const viewOpts = normalizeAvViews(av).map((v: any) => ({ value: v.id, text: `${v.name || v.id} (${v.type || v.layoutType || ""})` }));
        setOptions(viewID, viewOpts, { value: "", text: "（默认视图）" });

        const keyList = normalizeAvKeys(keys).map((k: any) => ({ value: k.id, text: `${k.name || k.id} [${k.type}]` }));
        setOptions(startKeyID, keyList, { value: "", text: "（不使用）" });
        setOptions(endKeyID, keyList, { value: "", text: "（不使用）" });
        setOptions(statusKeyID, keyList, { value: "", text: "（不使用）" });
        setOptions(parentKeyID, keyList, { value: "", text: "（不使用）" });
        setOptions(progressKeyID, keyList, { value: "", text: "（不使用）" });
        setOptions(typeKeyID, keyList, { value: "", text: "（不使用）" });

        await fillFromConfig();
        showMessage("已加载 AV 视图与列", 3000, "info");
      } catch (e: any) {
        console.error(e);
        showMessage(`加载失败：${e?.message || e}`, 8000, "error");
      }
    };

    const autoCreateColumns = async () => {
      const id = avID.value.trim();
      if (!id) {
        showMessage("请先填写 avID", 5000, "error");
        return;
      }

      try {
        const keys = await getAttributeViewKeysByAvID(id);
        const keyArr = normalizeAvKeys(keys);
        const existingKeys = new Set(keyArr.map((k: any) => k.name.toLowerCase()));

        const columnsToCreate = [
          { name: "开始日期", type: "date" as const },
          { name: "结束日期", type: "date" as const },
          { name: "状态", type: "multiSelect" as const, options: ["进行中", "已完成", "已暂停"] },
          { name: "父任务", type: "relation" as const },
          { name: "进度", type: "number" as const },
        ];

        const createdKeys: Record<string, string> = {};

        for (const col of columnsToCreate) {
          if (existingKeys.has(col.name.toLowerCase())) {
            // Find existing key
            const existing = keyArr.find((k: any) => k.name.toLowerCase() === col.name.toLowerCase());
            if (existing) {
              createdKeys[col.name] = existing.id;
            }
            continue;
          }

          try {
            const keyData: any = {
              name: col.name,
              type: col.type,
            };

            if (col.type === "multiSelect" && col.options) {
              keyData.options = col.options.map(opt => ({ name: opt }));
            }

            const result = await addAttributeViewKey(id, keyData);
            if (result && result.code === 0 && result.data) {
              createdKeys[col.name] = result.data.id;
              showMessage(`已创建列：${col.name}`, 3000, "info");
            }
          } catch (e: any) {
            console.error(`创建列 ${col.name} 失败:`, e);
            showMessage(`创建列 ${col.name} 失败：${e?.message || e}`, 5000, "error");
          }
        }

        // Refresh keys and update selects
        await loadKeysAndViews();

        // Auto-select created keys
        if (createdKeys["开始日期"] && startKeyID) {
          startKeyID.value = createdKeys["开始日期"];
        }
        if (createdKeys["结束日期"] && endKeyID) {
          endKeyID.value = createdKeys["结束日期"];
        }
        if (createdKeys["状态"] && statusKeyID) {
          statusKeyID.value = createdKeys["状态"];
        }
        if (createdKeys["父任务"] && parentKeyID) {
          parentKeyID.value = createdKeys["父任务"];
        }
        if (createdKeys["进度"] && progressKeyID) {
          progressKeyID.value = createdKeys["进度"];
        }

        showMessage("自动创建列完成", 3000, "info");
      } catch (e: any) {
        console.error(e);
        showMessage(`自动创建列失败：${e?.message || e}`, 8000, "error");
      }
    };

    loadBtn.addEventListener("click", () => {
      void loadKeysAndViews();
    });

    autoCreateBtn.addEventListener("click", () => {
      void autoCreateColumns();
    });

    // keep element refs for confirmCallback
    (this as any)._taskAvSettingEls = {
      dbId: undefined,
      dbName,
      avID,
      viewID,
      startKeyID,
      endKeyID,
      statusKeyID,
      parentKeyID,
      progressKeyID,
      typeKeyID,
    };

    wrap.append(
      dbNameRow,
      avIdRow,
      viewRow,
      startRow,
      endRow,
      statusRow,
      parentRow,
      progressRow,
      typeRow,
    );

    // init default values
    void fillFromConfig();

    return wrap;
  }
}
