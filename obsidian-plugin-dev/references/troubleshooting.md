# 调试技巧与常见问题

## 开发环境搭建

### 推荐工作流

1. 创建专门的测试 Vault（不要在主力 Vault 中开发）
2. 在 esbuild 中设置 `outdir` 直接输出到测试 Vault 的插件目录
3. 安装 [Hot-Reload](https://github.com/pjeby/hot-reload) 插件实现自动重载
4. 使用 `Ctrl+Shift+I` 打开 DevTools

### esbuild 输出到 Vault

```javascript
// esbuild.config.mjs
const VAULT_PLUGIN_DIR = "D:/TestVault/.obsidian/plugins/my-plugin";

esbuild.build({
  // ...
  outfile: prod ? "main.js" : `${VAULT_PLUGIN_DIR}/main.js`,
  // ...
});
```

开发模式下还需要将 `manifest.json` 和 `styles.css` 复制到插件目录。

## 常见问题

### 1. 插件不出现在插件列表中

**原因**：`manifest.json` 格式错误或文件位置不对。

**检查**：
- 确认文件位于 `.obsidian/plugins/your-plugin-id/` 目录下
- 确认 `manifest.json` 是有效 JSON
- 确认 `id` 字段与目录名一致
- 确认 `main.js` 存在且不为空

### 2. "Plugin failed to load" 错误

**常见原因**：
- `main.js` 中存在语法错误
- 引用了未安装的模块
- 忘记将 `obsidian` 标记为 external

**调试步骤**：
1. 打开 DevTools (Ctrl+Shift+I)
2. 查看 Console 标签中的错误信息
3. 检查 esbuild 配置中 `external` 列表是否完整

### 3. 命令注册后不显示

**原因**：`editorCallback` 类型的命令只在编辑器激活时显示。

**解决**：如果需要命令始终可用，使用 `callback` 或 `checkCallback`。

### 4. 设置不保存 / 加载异常

**检查清单**：
- 确认在 `onload()` 中调用了 `await this.loadSettings()`
- 确认 `loadSettings()` 使用了 `Object.assign({}, DEFAULT_SETTINGS, await this.loadData())`
- 确认每次修改后调用了 `await this.saveSettings()`
- 确认 DEFAULT_SETTINGS 与接口匹配

### 5. View 无法打开 / 白屏

**常见原因**：
- `registerView` 和 `setViewState` 中的 `type` 不一致
- `onOpen()` 中抛出了错误
- 忘记在 `onunload()` 中调用 `detachLeavesOfType()`

**调试**：
```typescript
// 临时添加调试代码
async onOpen() {
  try {
    // ... 原始代码
    console.log('View opened successfully');
  } catch (e) {
    console.error('View failed to open:', e);
  }
}
```

### 6. 编辑器扩展不生效

**检查清单**：
- 确认使用 `registerEditorExtension()` 注册了扩展
- 确认传入的是数组：`registerEditorExtension([extension])`
- 确认 State Field 的 `provide` 方法正确暴露了 decorations
- 确认 View Plugin 的 `pluginSpec` 正确声明了 `decorations` 属性
- 使用 DevTools 检查是否有 CM6 相关错误

### 7. Markdown 后处理器不触发

**原因**：后处理器只在**阅读模式**下生效。

**检查**：
- 切换到阅读模式（或实时预览模式）
- 确认选择器匹配正确的 DOM 元素
- 使用 DevTools Elements 面板检查实际渲染的 DOM 结构

### 8. 移动端兼容问题

**常见问题**：
- 状态栏在移动端不显示（Obsidian 移动端不支持）
- 触摸事件与鼠标事件差异
- 窗口/弹出窗口 API 不可用

**解决**：
```typescript
import { Platform } from 'obsidian';

if (Platform.isDesktop) {
  this.addStatusBarItem().setText('Desktop only');
}

if (Platform.isMobile) {
  // 移动端特殊处理
}
```

### 9. TypeScript 类型错误

**常见场景**：

```typescript
// 访问 cm 属性
// @ts-expect-error - Obsidian 未暴露 cm 类型
const editorView = view.editor.cm as EditorView;

// 访问 app.plugins
// @ts-expect-error - plugins 属性未公开
const plugins = this.app.plugins;
```

### 10. 样式不生效

**检查**：
- `styles.css` 放在插件根目录（与 `main.js` 同级）
- 使用 DevTools Elements 面板检查样式是否加载
- 检查 CSS 选择器优先级（可能被 Obsidian 主题覆盖）
- 使用 Obsidian CSS 变量确保主题兼容

## 调试技巧

### DevTools 使用

```typescript
// 在代码中设置断点
debugger; // DevTools 打开时会在此处暂停

// 检查 app 对象
console.log(this.app);
console.log(this.app.vault.getRoot());
console.log(this.app.workspace.getLeavesOfType('markdown'));

// 检查当前编辑器状态
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
if (view) {
  console.log('Editor content:', view.editor.getValue());
  console.log('Cursor:', view.editor.getCursor());
  console.log('Selection:', view.editor.getSelection());
}

// 检查元数据缓存
const file = this.app.workspace.getActiveFile();
if (file) {
  const cache = this.app.metadataCache.getFileCache(file);
  console.log('Frontmatter:', cache?.frontmatter);
  console.log('Links:', cache?.links);
  console.log('Tags:', cache?.tags);
}
```

### 热重载调试

安装 Hot-Reload 插件后，在插件根目录创建 `.hotreload` 空文件：

```bash
# 在插件目录下创建
touch .obsidian/plugins/my-plugin/.hotreload
```

每次 `main.js` 变更时自动重载插件。

### 移动端远程调试

**Android**：
1. 在 Android 设备上启用 USB 调试
2. 使用 ADB 连接：`adb forward tcp:9222 tcp:9222`
3. Chrome 中打开 `chrome://inspect`

**iOS**：
1. 在 Mac 上打开 Safari → 开发菜单
2. 选择连接的 iOS 设备
3. 选择 Obsidian WebView

## 性能优化提示

### 避免频繁文件操作

```typescript
// ❌ 每次修改都保存设置
editor.on('change', async () => {
  await this.saveSettings();
});

// ✅ 防抖处理
import { debounce } from 'obsidian';
const debouncedSave = debounce(async () => {
  await this.saveSettings();
}, 1000, true);
```

### View Plugin 优化

```typescript
update(update: ViewUpdate) {
  // 仅在必要时重建装饰
  if (update.docChanged || update.viewportChanged) {
    this.decorations = this.buildDecorations(update.view);
  }
}

buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  // 仅处理可见范围
  for (const { from, to } of view.visibleRanges) {
    // ...
  }
  return builder.finish();
}
```

### 使用 cachedRead 代替 read

```typescript
// read() 每次从磁盘读取
const content = await this.app.vault.read(file);

// cachedRead() 使用缓存，更快
const content = await this.app.vault.cachedRead(file);
```

### 延迟加载

```typescript
onload() {
  // 不要在 onload 中执行耗时操作
  // 使用 onLayoutReady 延迟
  this.app.workspace.onLayoutReady(() => {
    this.initializeHeavyFeature();
  });
}
```
