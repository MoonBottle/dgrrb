import {
  Plugin,
  getFrontend,
  Setting,
  showMessage,
  openTab,
} from "siyuan";
import "@/index.scss";
import PluginInfoString from '@/../plugin.json'
import { getAttributeView, getAttributeViewKeysByAvID } from "@/api";
import { createApp } from "vue";
import TaskGanttApp from "@/ui/TaskGanttApp.vue";

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
  private readonly storageKeyAvConfig = "task-av-config";
  private readonly tabTypeTaskGantt = "task-gantt";

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

    // Plugin Setting
    this.setting = new Setting({
      width: "980px",
      confirmCallback: async () => {
        const els = (this as any)._taskAvSettingEls as {
          avID?: HTMLInputElement;
          viewID?: HTMLSelectElement;
          startKeyID?: HTMLSelectElement;
          endKeyID?: HTMLSelectElement;
          statusKeyID?: HTMLSelectElement;
          parentKeyID?: HTMLSelectElement;
          progressKeyID?: HTMLSelectElement;
        } | undefined;

        if (!els?.avID) {
          showMessage("设置项尚未初始化", 5000, "error");
          return;
        }

        const payload = {
          avID: els.avID.value.trim(),
          viewID: els.viewID?.value?.trim() || "",
          startKeyID: els.startKeyID?.value?.trim() || "",
          endKeyID: els.endKeyID?.value?.trim() || "",
          statusKeyID: els.statusKeyID?.value?.trim() || "",
          parentKeyID: els.parentKeyID?.value?.trim() || "",
          progressKeyID: els.progressKeyID?.value?.trim() || "",
        };

        if (!payload.avID) {
          showMessage("请先填写 avID", 5000, "error");
          return;
        }

        await this.saveData(this.storageKeyAvConfig, payload);
        showMessage("已保存任务数据库配置", 4000, "info");
      },
    });

    this.setting.addItem({
      title: "任务数据库（AV）配置",
      direction: "column",
      description: "绑定已有属性视图（数据库），并选择关键列（开始/结束/状态/父任务/进度）",
      createActionElement: () => {
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

        const avIdRow = row();
        const avID = input();
        avID.placeholder = "输入任务数据库 avID（不是 blockID）";
        const loadBtn = btn("加载列/视图");
        avIdRow.append(label("avID"), avID, loadBtn);

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

        const setOptions = (sel: HTMLSelectElement, list: Array<{ value: string; text: string }>, first?: { value: string; text: string }) => {
          sel.innerHTML = "";
          if (first)
            sel.append(option(first.value, first.text));
          for (const it of list) {
            sel.append(option(it.value, it.text));
          }
        };

        const fillFromConfig = async () => {
          const saved = await this.loadData(this.storageKeyAvConfig).catch(() => null) as any;
          if (saved?.avID)
            avID.value = saved.avID;
          if (saved?.viewID)
            viewID.value = saved.viewID;
          if (saved?.startKeyID)
            startKeyID.value = saved.startKeyID;
          if (saved?.endKeyID)
            endKeyID.value = saved.endKeyID;
          if (saved?.statusKeyID)
            statusKeyID.value = saved.statusKeyID;
          if (saved?.parentKeyID)
            parentKeyID.value = saved.parentKeyID;
          if (saved?.progressKeyID)
            progressKeyID.value = saved.progressKeyID;
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

            await fillFromConfig();
            showMessage("已加载 AV 视图与列", 3000, "info");
          } catch (e: any) {
            console.error(e);
            showMessage(`加载失败：${e?.message || e}`, 8000, "error");
          }
        };

        loadBtn.addEventListener("click", () => {
          void loadKeysAndViews();
        });

        // keep element refs for confirmCallback
        (this as any)._taskAvSettingEls = {
          avID,
          viewID,
          startKeyID,
          endKeyID,
          statusKeyID,
          parentKeyID,
          progressKeyID,
        };

        wrap.append(
          avIdRow,
          viewRow,
          startRow,
          endRow,
          statusRow,
          parentRow,
          progressRow,
        );

        // init default values
        void fillFromConfig();

        return wrap;
      },
    });

    // Register custom tab (Task Gantt)
    const plugin = this;
    this.addTab({
      type: this.tabTypeTaskGantt,
      init(this: any) {
        // this -> Custom
        const container = document.createElement("div");
        container.className = "dgrrb-taskgantt-root";
        (this.element as HTMLElement).appendChild(container);
        const app = createApp(TaskGanttApp, {
          plugin,
        });
        app.mount(container);
        this._vueApp = app;
        this._vueContainer = container;
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
        this._vueApp = null;
        this._vueContainer = null;
      },
    });

    // Top bar button -> open tab
    this.addTopBar({
      icon: "iconCalendar",
      title: "任务甘特",
      callback: () => {
        openTab({
          app: this.app,
          custom: {
            id: `${this.name}${this.tabTypeTaskGantt}`,
            icon: "iconCalendar",
            title: "任务甘特",
            data: {},
          },
          openNewTab: true,
        });
      },
    });
  }

  onunload() {
    // Tab lifecycle is handled by Siyuan Custom destroy hooks
  }

  openSetting() {
    this.setting.open(this.name)
  }
}
