import { defineStore } from "pinia";

export const useFilterStore = defineStore("filter", {
  state: () => ({
    filterStatus: "进行中",
    filterType: "任务",
    filterProject: "",
  }),

  actions: {
    setFilterStatus(value: string) {
      this.filterStatus = value;
    },

    setFilterType(value: string) {
      this.filterType = value;
    },

    setFilterProject(value: string) {
      this.filterProject = value;
    },

    resetFilters() {
      this.filterStatus = "";
      this.filterType = "";
      this.filterProject = "";
    },
  },
});
