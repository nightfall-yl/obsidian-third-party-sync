---
name: obsidian-plugin-dev
description: Obsidian 插件全栈开发工作室。基于 TypeScript + Obsidian API + esbuild 技术栈。当用户需要：(1) 创建 Obsidian 插件项目；(2) 开发插件功能（命令、视图、设置、编辑器扩展、Markdown 处理等）；(3) 集成前端框架（React/Svelte/Vue）； (4) 调试测试插件；(5) 发布到 Obsidian 社区时使用。
---

# Obsidian 插件开发工作室

## 需求分类决策树

收到开发请求时，通过以下问题快速判断复杂度和模板选择：

**Q1: 是否需要修改编辑器外观或行为？**（语法高亮、装饰、自动补全、实时预览）
→ **是**：使用 `template-editor-extension`，参考 [editor-extensions.md](references/editor-extensions.md)

**Q2: 是否需要独立面板/侧边栏视图？**（数据展示、列表管理、自定义界面）
→ **是**：使用 `template-view`，参考 [ui-patterns.md](references/ui-patterns.md)

**Q3: 其他需求？**（命令、菜单、文本处理、设置、通知等）
→ 使用 `template-simple`

**复杂插件**：组合多个模板的模式。例如"带侧边栏的编辑器扩展"= view + editor-extension。

**框架集成**：如果需要 React/Svelte/Vue，在任意模板基础上叠加框架配置。
→ 参考 [framework-integration.md](references/framework-integration.md)

## 快速开始

### 项目结构

```
my-plugin/
├── main.ts              # 插件入口（必须）
├── manifest.json        # 插件清单（必须）
├── package.json         # npm 依赖
├── tsconfig.json        # TypeScript 配置
├── esbuild.config.mjs   # 构建配置
├── styles.css           # 样式文件（可选）
├── view.ts              # 自定义视图（可选）
├── settings.ts          # 设置模块（可选）
├── extension.ts         # 编辑器扩展（可选）
└── widget.ts            # 装饰小部件（可选）
```

### 脚本初始化

```powershell
# PowerShell 初始化
& "$env:USERPROFILE\.codex\skills\obsidian-plugin-dev\scripts\init-obsidian-plugin.ps1" `
  -Name "my-plugin" -Template "simple" -VaultPath "D:\MyVault"
```

```bash
# macOS / Linux 初始化
~/.codex/skills/obsidian-plugin-dev/scripts/init-obsidian-plugin.sh \
  --name my-plugin --template simple --vault-path "$HOME/Documents/MyVault"
```

### 手动创建

1. 创建项目目录并 `npm init -y`
2. 安装依赖：`npm install --save-dev obsidian @types/node typescript esbuild builtin-modules`
3. 从合适的 `assets/template-*/` 目录复制模板文件
4. 替换 `{{PLUGIN_ID}}`、`{{PLUGIN_NAME}}` 和 `{{PLUGIN_CLASS}}` 占位符
5. `npm run dev` 启动开发构建

### 开发调试

```bash
# 开发构建（监听模式）
npm run dev

# 生产构建
npm run build
```

将构建产物（main.js, manifest.json, styles.css）复制到 Vault 的 `.obsidian/plugins/your-plugin-id/` 目录。
在 Obsidian 设置 → 第三方插件 → 启用插件。使用 Ctrl+R 重新加载。

推荐安装 [Hot-Reload](https://github.com/pjeby/hot-reload) 插件实现自动重载。

## 插件骨架代码

### main.ts 基础结构

```typescript
import { Plugin, Notice } from 'obsidian';

interface MyPluginSettings {
  option1: string;
  option2: boolean;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  option1: 'default',
  option2: false,
};

export default class MyPlugin extends Plugin {
  settings: MyPluginSettings;

  async onload() {
    await this.loadSettings();

    // 注册命令
    this.addCommand({
      id: 'my-command',
      name: 'My Command',
      callback: () => { new Notice('Hello!'); },
    });

    // 功能区图标
    this.addRibbonIcon('dice', 'My Plugin', () => { new Notice('Clicked!'); });

    // 状态栏
    this.addStatusBarItem().setText('My Plugin');

    // 设置面板
    this.addSettingTab(new MySettingTab(this.app, this));
  }

  onunload() {
    // 清理所有资源
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
```

### manifest.json

```json
{
  "id": "{{PLUGIN_ID}}",
  "name": "{{PLUGIN_NAME}}",
  "version": "1.0.0",
  "minAppVersion": "0.15.0",
  "description": "Description of your plugin.",
  "author": "Your Name",
  "authorUrl": "https://github.com/your-name",
  "isDesktopOnly": false
}
```

### esbuild.config.mjs

```javascript
import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
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
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
```

## 核心 API 速览

### App — 应用入口（通过 `this.app` 访问）

| 属性 | 说明 |
|------|------|
| `vault: Vault` | 文件库操作 |
| `workspace: Workspace` | 工作区布局 |
| `metadataCache: MetadataCache` | 文件元数据缓存 |
| `fileManager: FileManager` | 文件管理器 |

### Vault — 文件操作

| 方法 | 说明 |
|------|------|
| `read(file)` / `cachedRead(file)` | 读取文件内容 |
| `create(path, data)` | 创建文件 |
| `modify(file, data)` | 修改文件 |
| `append(file, data)` | 追加内容 |
| `delete(file)` / `trash(file, system)` | 删除文件 |
| `rename(file, newPath)` | 重命名/移动 |
| `getMarkdownFiles()` | 获取所有 Markdown 文件 |
| `getAbstractFileByPath(path)` | 按路径获取文件 |

### Workspace — 工作区

| 方法 | 说明 |
|------|------|
| `getActiveFile()` | 获取当前活跃文件 |
| `getActiveViewOfType(T)` | 获取特定类型的活跃视图 |
| `getLeavesOfType(type)` | 获取所有指定类型的叶子 |
| `detachLeavesOfType(type)` | 关闭指定类型的所有叶子 |
| `getLeaf(newLeaf?)` | 获取或创建叶子 |
| `getRightLeaf(false)` | 获取右侧边栏叶子 |
| `onLayoutReady(cb)` | 布局就绪回调 |

### Editor — 编辑器操作

| 方法 | 说明 |
|------|------|
| `getValue()` / `setValue(content)` | 读写全文 |
| `getSelection()` / `replaceSelection(text)` | 选区操作 |
| `getCursor()` / `setCursor(pos)` | 光标操作 |
| `getLine(n)` / `setLine(n, text)` | 行操作 |
| `replaceRange(text, from, to?)` | 范围替换 |
| `transaction(tx)` | 批量编辑事务 |

更完整的 API 参考见 [api-quick-reference.md](references/api-quick-reference.md)。

## UI 组件指南

### 命令注册

```typescript
// 简单命令
this.addCommand({ id: 'cmd', name: 'Do Something', callback: () => {} });

// 编辑器命令（自动检查编辑器可用性）
this.addCommand({
  id: 'editor-cmd', name: 'Editor Action',
  editorCallback: (editor, ctx) => { editor.replaceSelection('text'); },
});

// 条件命令
this.addCommand({
  id: 'check-cmd', name: 'Conditional',
  checkCallback: (checking) => {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view) { if (!checking) { /* 执行操作 */ } return true; }
    return false;
  },
});
```

### 模态框

```typescript
class InputModal extends Modal {
  result: string;
  onSubmit: (result: string) => void;

  constructor(app: App, onSubmit: (result: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    new Setting(contentEl).setName('Input').addText((text) =>
      text.onChange((value) => { this.result = value; })
    );
    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText('Submit').setCta().onClick(() => {
        this.close();
        this.onSubmit(this.result);
      })
    );
  }

  onClose() { this.contentEl.empty(); }
}
```

### 设置面板

**推荐方式：使用 SettingGroup（Obsidian 原生分组组件）**

```typescript
import { App, PluginSettingTab, Setting, SettingGroup } from 'obsidian';

class MySettingTab extends PluginSettingTab {
  plugin: MyPlugin;
  constructor(app: App, plugin: MyPlugin) { super(app, plugin); this.plugin = plugin; }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // 方式1：简单标题（纯文本）
    new SettingGroup(containerEl)
      .setHeading('General')
      .addSetting(setting => setting
        .setName('Option name')
        .setDesc('Description text')
        .addToggle(toggle => toggle.setValue(this.plugin.settings.option1)
          .onChange(async (v) => { this.plugin.settings.option1 = v; await this.plugin.saveSettings(); })))
      .addSetting(setting => setting
        .setName('Another option')
        .setDesc('More description')
        .addDropdown(dropdown => dropdown
          .addOption('a', 'Option A')
          .addOption('b', 'Option B')
          .setValue(this.plugin.settings.option2)
          .onChange(async (v) => { this.plugin.settings.option2 = v; await this.plugin.saveSettings(); })));

    // 方式2：复杂标题（带说明和链接）
    const heading = createFragment();
    heading.createDiv({ cls: 'setting-item-name', text: 'Advanced' });
    heading.createDiv({ cls: 'setting-item-description' }).setText('Configure advanced options.');

    new SettingGroup(containerEl)
      .setHeading(heading)
      .addSetting(setting => setting.setName('...').setDesc('...').addText(...));
  }
}
```

**传统方式：直接使用 Setting（适用于简单插件）**

```typescript
class MySettingTab extends PluginSettingTab {
  plugin: MyPlugin;
  constructor(app: App, plugin: MyPlugin) { super(app, plugin); this.plugin = plugin; }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName('Setting name').setDesc('Description')
      .addText((text) => text.setValue(this.plugin.settings.option1)
        .onChange(async (v) => { this.plugin.settings.option1 = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl)
      .setName('Toggle').addToggle((toggle) => toggle.setValue(this.plugin.settings.option2)
        .onChange(async (v) => { this.plugin.settings.option2 = v; await this.plugin.saveSettings(); }));
  }
}
```

**SettingGroup vs 手动卡片对比**：

| 特性 | SettingGroup | 手动卡片 |
|------|-------------|---------|
| 代码量 | 少（链式调用） | 多（需手动创建 DOM） |
| 主题兼容 | 完全原生 | 需自行处理 CSS 变量 |
| 标题样式 | 自动使用 Obsidian 原生 `.setting-item-heading` | 需自定义 CSS 类 |
| 分割线 | 自动添加 | 需手动添加 border-top |
| 推荐度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

**优先使用 SettingGroup**，只有在需要完全自定义布局时才用手动卡片方式。

### 自定义视图

```typescript
import { ItemView, WorkspaceLeaf } from 'obsidian';
const VIEW_TYPE = 'my-view';

class MyView extends ItemView {
  constructor(leaf: WorkspaceLeaf) { super(leaf); }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'My View'; }
  async onOpen() { this.containerEl.children[1].createEl('h4', { text: 'Hello' }); }
  async onClose() { /* 清理 */ }
}

// 在 Plugin.onload() 中注册
this.registerView(VIEW_TYPE, (leaf) => new MyView(leaf));

// 激活视图
async activateView() {
  this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  await this.app.workspace.getRightLeaf(false).setViewState({ type: VIEW_TYPE, active: true });
  this.app.workspace.revealLeaf(this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]);
}

// 在 Plugin.onunload() 中清理
this.app.workspace.detachLeavesOfType(VIEW_TYPE);
```

更多 UI 模式见 [ui-patterns.md](references/ui-patterns.md)。

## 事件系统

使用 `registerEvent` 和 `registerInterval` 注册事件，确保插件卸载时自动清理。

```typescript
// Vault 事件
this.registerEvent(this.app.vault.on('create', (file) => {}));
this.registerEvent(this.app.vault.on('modify', (file) => {}));
this.registerEvent(this.app.vault.on('delete', (file) => {}));
this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {}));

// Workspace 事件
this.registerEvent(this.app.workspace.on('file-open', (file) => {}));
this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {}));
this.registerEvent(this.app.workspace.on('layout-change', () => {}));
this.registerEvent(this.app.workspace.on('file-menu', (menu, file, source) => {
  menu.addItem((item) => item.setTitle('My Action').onClick(() => {}));
}));
this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor, info) => {
  menu.addItem((item) => item.setTitle('Editor Action').onClick(() => {}));
}));
this.registerEvent(this.app.workspace.on('editor-change', (editor, info) => {}));

// MetadataCache 事件
this.registerEvent(this.app.metadataCache.on('changed', (file, data, cache) => {}));
this.registerEvent(this.app.metadataCache.on('resolved', () => {}));

// 定时器（自动清理）
this.registerInterval(window.setInterval(() => {}, 5 * 60 * 1000));
```

## 编辑器扩展入口

编辑器扩展用于修改**编辑模式**下的外观和行为，基于 CodeMirror 6。

**选择指南**：
- **State Field**：管理独立于文档的自定义状态 → [editor-extensions.md](references/editor-extensions.md)
- **View Plugin**：响应视口变化、操作 DOM → [editor-extensions.md](references/editor-extensions.md)
- **Decoration**：修改文档外观（高亮、替换、插入小部件）→ [editor-extensions.md](references/editor-extensions.md)
- **Markdown 后处理器**：修改**阅读模式**渲染 → 使用 `registerMarkdownPostProcessor`
- **代码块处理器**：自定义代码块渲染 → 使用 `registerMarkdownCodeBlockProcessor`

```typescript
// 注册编辑器扩展
this.registerEditorExtension([myViewPlugin, myStateField]);

// 注册 Markdown 后处理器
this.registerMarkdownPostProcessor((el, ctx) => { /* 处理阅读视图 DOM */ });

// 注册代码块处理器
this.registerMarkdownCodeBlockProcessor('csv', (source, el, ctx) => { /* 渲染 CSV */ });
```

## 框架集成入口

| 框架 | 适用场景 | 关键依赖 |
|------|----------|----------|
| **React** | 复杂交互 UI、状态驱动界面 | `react react-dom` |
| **Svelte** | 轻量高性能、简洁语法 | `svelte esbuild-svelte` |
| **Vue** | 模板偏好、UI 库生态（Naive UI 等） | `vue @vitejs/plugin-vue` |

详见 [framework-integration.md](references/framework-integration.md)。

## 开发工作流

1. **环境搭建**：Node.js 16+ → `npm install` → `npm run dev`
2. **Hot-Reload**：安装 pjeby/hot-reload 插件，修改代码后自动重载
3. **调试**：Ctrl+Shift+I 打开 DevTools，使用 `console.log` 和断点
4. **移动端测试**：通过 ADB 连接 Android 或 Safari 远程调试 iOS
5. **Vault 路径**：可在 esbuild 配置中设置 `outdir` 直接输出到 Vault 插件目录

```javascript
// esbuild.config.mjs 中直接输出到 Vault
const VAULT_PLUGIN_DIR = "D:/MyVault/.obsidian/plugins/my-plugin";
// ...
outfile: prod ? "main.js" : `${VAULT_PLUGIN_DIR}/main.js`,
```

## 发布流程

### 发布检查清单（简版）

- [ ] `manifest.json` 中 `id`、`name`、`version`、`minAppVersion` 正确
- [ ] `versions.json` 包含版本到最低 Obsidian 版本的映射
- [ ] 所有路径使用 `normalizePath()`
- [ ] `onunload()` 中清理了所有资源
- [ ] 没有使用 `innerHTML`（XSS 风险）
- [ ] 不包含追踪代码或远程请求（除核心功能外）
- [ ] 不包含 `eval()` 或 `Function()` 调用

### GitHub Release

1. 更新 `manifest.json` 和 `versions.json` 中的版本号
2. 创建 Git 标签：`git tag -a 1.0.0 -m "Release 1.0.0"`
3. 推送标签：`git push origin 1.0.0`
4. GitHub Actions 自动构建并上传 `main.js`、`manifest.json`、`styles.css`

### 社区提交

1. Fork `obsidianmd/obsidian-releases`
2. 在 `community-plugins.json` 添加插件条目
3. 创建 Pull Request 等待审核

详见 [publishing-checklist.md](references/publishing-checklist.md)。

## 质量保证规则

生成的所有代码**必须**遵守以下规则：

1. **路径规范化**：所有文件路径使用 `normalizePath()` 处理
2. **资源清理**：`onunload()` 中清理所有视图、事件、定时器、DOM 元素
3. **自动清理注册**：使用 `registerEvent()`/`registerInterval()` 而非直接 `addEventListener`/`setInterval`
4. **视图引用**：不直接持有视图引用，使用 `getLeavesOfType()` 动态获取
5. **设置模式**：使用 `loadData()`/`saveData()` + `Object.assign({}, DEFAULT, loaded)` 标准模式
6. **平台检测**：使用 `Platform.isMobile`/`Platform.isDesktop` 而非 User-Agent
7. **类型安全**：访问 CM6 EditorView 使用 `@ts-expect-error` 标注
8. **安全规范**：禁止 `innerHTML`、`eval()`、`Function()`，使用 `createEl()` 构建 DOM
9. **设置页风格**：**优先使用 `SettingGroup` 组件**（Obsidian 原生分组组件），这是社区最佳实践（参考 obsidian-minimal-settings）。`SettingGroup` 自动处理标题样式、分割线、卡片背景，代码更简洁且主题兼容性最好。只有在需要完全自定义布局时才用手动卡片方式（标题用 `createEl('h2')` 放在容器直接子级，卡片用 `createDiv({ cls: 'xxx-card' })` 包裹）。详见 [ui-patterns.md#设置页视觉风格](references/ui-patterns.md)
10. **最低版本**：`minAppVersion` 设置为 `0.15.0`（除非使用新 API）

## 参考文档索引

| 文档 | 阅读时机 |
|------|----------|
| [api-quick-reference.md](references/api-quick-reference.md) | 查找具体 API 方法签名时 |
| [ui-patterns.md](references/ui-patterns.md) | 开发 UI 组件（命令/菜单/模态框/设置/视图/状态栏）时 |
| [editor-extensions.md](references/editor-extensions.md) | 开发 CM6 编辑器扩展（State Field/View Plugin/Decoration）时 |
| [framework-integration.md](references/framework-integration.md) | 集成 React/Svelte/Vue 框架时 |
| [publishing-checklist.md](references/publishing-checklist.md) | 准备发布插件到社区时 |
| [troubleshooting.md](references/troubleshooting.md) | 遇到调试问题或常见错误时 |
