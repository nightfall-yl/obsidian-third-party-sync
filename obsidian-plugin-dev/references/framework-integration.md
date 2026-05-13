# 前端框架集成方案

## React 集成

### 1. 安装依赖

```bash
npm install react react-dom
npm install --save-dev @types/react @types/react-dom
```

### 2. TypeScript 配置

在 `tsconfig.json` 中添加 JSX 支持：

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    // 或使用旧模式: "jsx": "react"
  }
}
```

### 3. React 组件

```tsx
// ReactView.tsx
import * as React from 'react';

interface Props {
  name: string;
}

export const ReactView: React.FC<Props> = ({ name }) => {
  const [count, setCount] = React.useState(0);

  return (
    <div className="my-plugin-react">
      <h4>Hello, {name}!</h4>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
};
```

### 4. 在 ItemView 中使用 React

```typescript
import { ItemView, WorkspaceLeaf } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ReactView } from './ReactView';

export const VIEW_TYPE = 'react-view';

export class MyReactView extends ItemView {
  root: Root | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return 'React View'; }

  async onOpen(): Promise<void> {
    this.root = createRoot(this.containerEl.children[1]);
    this.root.render(
      <React.StrictMode>
        <ReactView name="World" />
      </React.StrictMode>
    );
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
  }
}
```

### 5. 共享 App 上下文

```tsx
// AppContext.tsx
import * as React from 'react';
import { App } from 'obsidian';

export const AppContext = React.createContext<App | undefined>(undefined);

export const useApp = (): App => {
  const app = React.useContext(AppContext);
  if (!app) throw new Error('useApp must be used within AppContext.Provider');
  return app;
};

// 挂载时提供上下文
this.root.render(
  <AppContext.Provider value={this.app}>
    <ReactView name="World" />
  </AppContext.Provider>
);

// 在组件中使用
const MyComponent: React.FC = () => {
  const app = useApp();
  const files = app.vault.getMarkdownFiles();
  return <ul>{files.map(f => <li key={f.path}>{f.basename}</li>)}</ul>;
};
```

## Svelte 集成

### 1. 安装依赖

```bash
npm install --save-dev svelte svelte-preprocess @tsconfig/svelte esbuild-svelte
```

### 2. TypeScript 配置

```json
{
  "extends": "@tsconfig/svelte/tsconfig.json",
  "compilerOptions": {
    "types": ["svelte", "node"],
    // 注意：使用 esbuild-svelte 时需要移除 inlineSourceMap
  }
}
```

### 3. esbuild 配置

```javascript
// esbuild.config.mjs
import esbuild from "esbuild";
import sveltePlugin from "esbuild-svelte";
import sveltePreprocess from "svelte-preprocess";

esbuild.build({
  // ... 其他配置不变
  plugins: [
    sveltePlugin({
      preprocess: sveltePreprocess(),
    }),
  ],
  // ...
});
```

### 4. Svelte 组件

```svelte
<!-- MyComponent.svelte -->
<script lang="ts">
  export let name: string;
  let count = 0;

  function increment() {
    count += 1;
  }
</script>

<div class="my-plugin-svelte">
  <h4>Hello, {name}!</h4>
  <p>Count: {count}</p>
  <button on:click={increment}>Increment</button>
</div>

<style>
  .my-plugin-svelte {
    padding: 10px;
  }
</style>
```

### 5. 在 ItemView 中使用 Svelte

```typescript
import { ItemView, WorkspaceLeaf } from 'obsidian';
import MyComponent from './MyComponent.svelte';

export const VIEW_TYPE = 'svelte-view';

export class MySvelteView extends ItemView {
  component: MyComponent | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return 'Svelte View'; }

  async onOpen(): Promise<void> {
    this.component = new MyComponent({
      target: this.contentEl,
      props: { name: 'World' },
    });
  }

  async onClose(): Promise<void> {
    this.component?.$destroy();
  }
}
```

### 6. Svelte Store 管理 Plugin 状态

```typescript
// store.ts
import { writable } from 'svelte/store';
import type MyPlugin from './main';

const plugin = writable<MyPlugin>();
export default { plugin };

// 在 Plugin.onload() 中设置
import store from './store';
store.plugin.set(this);

// 在 Svelte 组件中使用
// Component.svelte
<script lang="ts">
  import store from './store';
  import type MyPlugin from './main';

  let plugin: MyPlugin;
  store.plugin.subscribe((p) => (plugin = p));
</script>

<p>Setting: {plugin?.settings?.option1}</p>
```

## Vue 集成

### 1. 安装依赖

```bash
npm install vue
```

### 2. Vue 组件

```vue
<!-- MyComponent.vue -->
<template>
  <div class="my-plugin-vue">
    <h4>Hello, {{ name }}!</h4>
    <p>Count: {{ count }}</p>
    <button @click="increment">Increment</button>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';

export default defineComponent({
  props: {
    name: { type: String, required: true },
  },
  setup() {
    const count = ref(0);
    const increment = () => { count.value++; };
    return { count, increment };
  },
});
</script>
```

### 3. 在 ItemView 中使用 Vue

```typescript
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createApp, App as VueApp } from 'vue';
import MyComponent from './MyComponent.vue';

export const VIEW_TYPE = 'vue-view';

export class MyVueView extends ItemView {
  vueApp: VueApp | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return 'Vue View'; }

  async onOpen(): Promise<void> {
    this.vueApp = createApp(MyComponent, { name: 'World' });
    this.vueApp.mount(this.containerEl.children[1]);
  }

  async onClose(): Promise<void> {
    this.vueApp?.unmount();
  }
}
```

### 4. 在设置面板中使用 Vue

```typescript
import { createApp, App as VueApp } from 'vue';
import SettingsComponent from './SettingsComponent.vue';

class MySettingTab extends PluginSettingTab {
  plugin: MyPlugin;
  vueApp: VueApp | null = null;

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.vueApp = createApp(SettingsComponent, {
      settings: this.plugin.settings,
      onSave: async (settings: MyPluginSettings) => {
        this.plugin.settings = settings;
        await this.plugin.saveSettings();
      },
    });
    this.vueApp.mount(containerEl);
  }

  hide(): void {
    this.vueApp?.unmount();
  }
}
```

## 框架选择建议

| 维度 | React | Svelte | Vue |
|------|-------|--------|-----|
| 包体积影响 | +40KB | ~0KB (编译时) | +30KB |
| 学习曲线 | 中等 | 低 | 低-中 |
| esbuild 兼容性 | 原生支持 | 需要 esbuild-svelte | 需要额外插件 |
| TypeScript 支持 | 优秀 | 良好 | 良好 |
| 社区插件采用率 | 高 | 中 | 低 |
| 推荐场景 | 复杂交互 UI | 追求轻量包体积 | 已有 Vue 经验 |

**默认推荐**：Svelte — 编译时框架，零运行时开销，对 Obsidian 插件包体积影响最小。

## esbuild 配置注意事项

不论使用哪种框架，esbuild 配置中必须将以下模块标记为 external：

```javascript
external: [
  "obsidian",
  "electron",
  "@codemirror/autocomplete", "@codemirror/collab",
  "@codemirror/commands", "@codemirror/language",
  "@codemirror/lint", "@codemirror/search",
  "@codemirror/state", "@codemirror/view",
  "@lezer/common", "@lezer/highlight", "@lezer/lr",
  ...builtins,
],
```

这些模块由 Obsidian 运行时提供，不需要打包进插件。
