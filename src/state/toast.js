import { reactive } from 'vue';

export const toasts = reactive([]);
let seq = 0;

/**
 * @param {string} message
 * @param {{tone?: 'info'|'success'|'warn'|'error', action?: {label: string, run: Function}, timeout?: number}} opts
 */
export function toast(message, { tone = 'info', action = null, timeout = 4500 } = {}) {
  const id = ++seq;
  toasts.push({ id, message, tone, action });
  if (timeout) setTimeout(() => dismissToast(id), timeout);
  return id;
}

export function dismissToast(id) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}
