import { defineStore } from "pinia";

export const useUiStore = defineStore("ui", {
  state: () => ({
    loading: false,
    error: "" as string,
  }),

  actions: {
    setLoading(value: boolean) {
      this.loading = value;
    },

    setError(message: string) {
      this.error = message;
    },

    clearError() {
      this.error = "";
    },
  },
});
