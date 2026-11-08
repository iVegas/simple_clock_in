// Minimal hash router: #/path -> { name, params }.
import { reactive } from 'vue';

const ROUTES = [
  ['/', 'clock'],
  ['/report', 'report'],
  ['/clocks', 'clocks'],
  ['/clock/:id', 'editor'],
  ['/setup', 'setup'],
  ['/google-setup', 'google'],
];

function match(pattern, path) {
  const p = pattern.split('/');
  const s = path.split('/');
  if (p.length !== s.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

function resolve() {
  const path = location.hash.replace(/^#/, '') || '/';
  for (const [pattern, name] of ROUTES) {
    const params = match(pattern, path);
    if (params) return { name, params, path };
  }
  return { name: 'clock', params: {}, path: '/' };
}

export const route = reactive(resolve());

window.addEventListener('hashchange', () => {
  Object.assign(route, resolve());
  window.scrollTo(0, 0);
});

export function go(path) {
  if (location.hash.replace(/^#/, '') === path) Object.assign(route, resolve());
  else location.hash = path;
}
