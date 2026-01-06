import {
  Plugin,
} from "siyuan";
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

let plugin = null
export function usePlugin(pluginProps?: Plugin): Plugin {
  console.log('usePlugin', pluginProps, plugin)
  if (pluginProps) {
    plugin = pluginProps
  }
  if (!plugin && !pluginProps) {
    console.error('need bind plugin')
  }
  return plugin;
}

// 创建全局 Pinia 实例，供所有应用共享
export const pinia = createPinia()

let app = null
export function init(plugin: Plugin) {
  // bind plugin hook
  usePlugin(plugin);

  const div = document.createElement('div')
  div.classList.toggle('plugin-sample-vite-vue-app')
  div.id = this.name
  app = createApp(App)
  app.use(pinia)
  app.mount(div)
  document.body.appendChild(div)
}

export function destroy() {
  app.unmount()
  const div = document.getElementById(this.name)
  document.body.removeChild(div)
}
