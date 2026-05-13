# UI 组件完整代码模式

## 1. 命令（Commands）

### 简单命令

```typescript
this.addCommand({
  id: 'simple-command',
  name: 'Simple Command',
  callback: () => {
    new Notice('Command executed!');
  },
});
```

### 编辑器命令

```typescript
this.addCommand({
  id: 'editor-command',
  name: 'Transform Selection',
  editorCallback: (editor: Editor, ctx: MarkdownView) => {
    const selection = editor.getSelection();
    editor.replaceSelection(selection.toUpperCase());
  },
});
```

### 条件命令

```typescript
this.addCommand({
  id: 'conditional-command',
  name: 'Only When Markdown Active',
  checkCallback: (checking: boolean) => {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view) {
      if (!checking) {
        // 实际执行操作
        const editor = view.editor;
        editor.replaceSelection('Inserted text');
      }
      return true; // 命令可用
    }
    return false; // 命令不可用
  },
});
```

### 带热键的命令

```typescript
this.addCommand({
  id: 'hotkey-command',
  name: 'Command with Hotkey',
  hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'a' }],
  callback: () => { /* ... */ },
});
// Mod = Ctrl (Windows) / Cmd (macOS)
```

## 2. 右键菜单（Context Menus）

### 自定义菜单

```typescript
const menu = new Menu();
menu.addItem((item) =>
  item
    .setTitle('Copy')
    .setIcon('documents')
    .onClick(() => {
      new Notice('Copied');
    })
);
menu.addSeparator();
menu.addItem((item) =>
  item
    .setTitle('Delete')
    .setIcon('trash')
    .onClick(() => {
      new Notice('Deleted');
    })
);
menu.showAtMouseEvent(event);
```

### 文件菜单扩展

```typescript
this.registerEvent(
  this.app.workspace.on('file-menu', (menu, file) => {
    menu.addItem((item) => {
      item
        .setTitle('Custom action')
        .setIcon('star')
        .onClick(async () => {
          new Notice(`Action on: ${file.path}`);
        });
    });
  })
);
```

### 编辑器右键菜单扩展

```typescript
this.registerEvent(
  this.app.workspace.on('editor-menu', (menu, editor, info) => {
    menu.addItem((item) => {
      item
        .setTitle('Selection info')
        .setIcon('info')
        .onClick(() => {
          new Notice(`Selected: ${editor.getSelection()}`);
        });
    });
  })
);
```

## 3. 模态框（Modals）

### 基础模态框

```typescript
import { App, Modal } from 'obsidian';

class AlertModal extends Modal {
  message: string;

  constructor(app: App, message: string) {
    super(app);
    this.message = message;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Alert' });
    contentEl.createEl('p', { text: this.message });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// 使用
new AlertModal(this.app, 'Hello World!').open();
```

### 输入模态框（带回调）

```typescript
import { App, Modal, Setting } from 'obsidian';

class InputModal extends Modal {
  result: string = '';
  onSubmit: (result: string) => void;

  constructor(app: App, onSubmit: (result: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Enter value' });

    new Setting(contentEl)
      .setName('Value')
      .addText((text) =>
        text.onChange((value) => {
          this.result = value;
        })
      );

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('Submit')
          .setCta()
          .onClick(() => {
            this.close();
            this.onSubmit(this.result);
          })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}

// 使用
new InputModal(this.app, (result) => {
  new Notice(`You entered: ${result}`);
}).open();
```

### 建议列表模态框

```typescript
import { App, SuggestModal } from 'obsidian';

interface BookSuggestion {
  title: string;
  author: string;
}

const ALL_BOOKS: BookSuggestion[] = [
  { title: 'Clean Code', author: 'Robert C. Martin' },
  { title: 'Design Patterns', author: 'Gang of Four' },
];

class BookSuggestModal extends SuggestModal<BookSuggestion> {
  getSuggestions(query: string): BookSuggestion[] {
    return ALL_BOOKS.filter((book) =>
      book.title.toLowerCase().includes(query.toLowerCase())
    );
  }

  renderSuggestion(book: BookSuggestion, el: HTMLElement) {
    el.createEl('div', { text: book.title });
    el.createEl('small', { text: book.author });
  }

  onChooseSuggestion(book: BookSuggestion, evt: MouseEvent | KeyboardEvent) {
    new Notice(`Selected: ${book.title}`);
  }
}
```

### 模糊搜索模态框

```typescript
import { App, FuzzySuggestModal } from 'obsidian';

class FileSuggestModal extends FuzzySuggestModal<TFile> {
  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }

  getItemText(file: TFile): string {
    return file.basename;
  }

  onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent) {
    new Notice(`Selected: ${file.path}`);
  }
}
```

## 4. 设置面板（Settings）

### 完整设置模式

```typescript
import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

// 1. 定义接口
interface MyPluginSettings {
  apiKey: string;
  enableFeature: boolean;
  dateFormat: string;
  fontSize: number;
  theme: string;
}

// 2. 默认值
const DEFAULT_SETTINGS: MyPluginSettings = {
  apiKey: '',
  enableFeature: true,
  dateFormat: 'YYYY-MM-DD',
  fontSize: 14,
  theme: 'default',
};

// 3. 在 Plugin 中加载/保存
export default class MyPlugin extends Plugin {
  settings: MyPluginSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MySettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// 4. 设置面板
class MySettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('my-plugin-settings');

    // 文本输入
    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Enter your API key')
      .addText((text) =>
        text
          .setPlaceholder('Enter key...')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          })
      );

    // 开关
    new Setting(containerEl)
      .setName('Enable feature')
      .setDesc('Toggle this feature on or off')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableFeature)
          .onChange(async (value) => {
            this.plugin.settings.enableFeature = value;
            await this.plugin.saveSettings();
          })
      );

    // 下拉选择
    new Setting(containerEl)
      .setName('Theme')
      .setDesc('Select a theme')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('default', 'Default')
          .addOption('dark', 'Dark')
          .addOption('light', 'Light')
          .setValue(this.plugin.settings.theme)
          .onChange(async (value) => {
            this.plugin.settings.theme = value;
            await this.plugin.saveSettings();
          })
      );

    // 滑块
    new Setting(containerEl)
      .setName('Font size')
      .setDesc('Adjust the font size')
      .addSlider((slider) =>
        slider
          .setLimits(10, 30, 1)
          .setValue(this.plugin.settings.fontSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.fontSize = value;
            await this.plugin.saveSettings();
          })
      );

    // 多行文本
    new Setting(containerEl)
      .setName('Custom CSS')
      .setDesc('Add custom CSS styles')
      .addTextArea((text) =>
        text
          .setPlaceholder('Enter CSS...')
          .setValue('')
          .onChange(async (value) => {
            // 处理 CSS
          })
      );

    // 按钮
    new Setting(containerEl)
      .setName('Reset settings')
      .setDesc('Restore default settings')
      .addButton((btn) =>
        btn
          .setButtonText('Reset')
          .setWarning()
          .onClick(async () => {
            this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
            await this.plugin.saveSettings();
            this.display(); // 刷新面板
          })
      );
  }
}
```

### 设置页视觉风格

**⭐ 推荐方式：使用 SettingGroup（Obsidian 原生分组组件）**

这是社区最佳实践，参考 [obsidian-minimal-settings](https://github.com/kepano/obsidian-minimal-settings) 的实现。`SettingGroup` 自动处理：
- 组标题样式（使用 `.setting-item-heading` 类）
- 卡片背景和圆角
- 设置项之间的分割线
- 主题兼容性（自动适配深色/浅色主题）

```typescript
import { App, PluginSettingTab, Setting, SettingGroup } from 'obsidian';

display(): void {
  const { containerEl } = this;
  containerEl.empty();

  // 简单标题（纯文本字符串）
  new SettingGroup(containerEl)
    .setHeading('General Settings')
    .addSetting(setting => setting
      .setName('Option name')
      .setDesc('Description text')
      .addToggle(toggle => toggle.setValue(true)
        .onChange(async (v) => { /* save */ })))
    .addSetting(setting => setting
      .setName('Another option')
      .setDesc('More description')
      .addDropdown(dropdown => dropdown
        .addOption('a', 'Option A')
        .addOption('b', 'Option B')
        .setValue('a')
        .onChange(async (v) => { /* save */ })));

  // 复杂标题（带说明和链接）
  const heading = createFragment();
  heading.createDiv({ cls: 'setting-item-name', text: 'Color scheme' });
  const desc = heading.createDiv({ cls: 'setting-item-description' });
  desc.appendText('For more options, use the ');
  desc.appendChild(createEl('a', {
    text: 'Style Settings',
    href: 'obsidian://show-plugin?id=obsidian-style-settings',
  }));
  desc.appendText(' plugin.');

  new SettingGroup(containerEl)
    .setHeading(heading)
    .addSetting(setting => setting
      .setName('Light mode color scheme')
      .setDesc('Preset color options for light mode.')
      .addDropdown(dropdown => dropdown
        .addOption('default', 'Default')
        .addOption('dark', 'Dark')
        .setValue('default')
        .onChange(async (v) => { /* save */ })));
}
```

**CSS 样式极简**（只需微调）：

```css
/* 仅需调整组标题下描述文字的间距 */
.setting-group > .setting-item-heading .setting-item-description {
  margin-top: 4px;
}
```

## 5. 功能区图标（Ribbon Actions）

```typescript
// 添加功能区按钮
const ribbonIconEl = this.addRibbonIcon('dice', 'My Plugin Tooltip', (evt: MouseEvent) => {
  new Notice('Ribbon icon clicked!');
});
ribbonIconEl.addClass('my-plugin-ribbon-class');
```

## 6. 状态栏（Status Bar）

```typescript
// 添加状态栏项
const statusBarItem = this.addStatusBarItem();
statusBarItem.setText('Ready');

// 动态更新
this.registerEvent(
  this.app.workspace.on('active-leaf-change', () => {
    const file = this.app.workspace.getActiveFile();
    statusBarItem.setText(file ? file.basename : 'No file');
  })
);

// 注意：移动端不支持状态栏
```

## 7. 自定义视图（Views）

### 完整视图模式

```typescript
import { ItemView, WorkspaceLeaf, Plugin } from 'obsidian';

export const VIEW_TYPE_EXAMPLE = 'example-view';

export class ExampleView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_EXAMPLE;
  }

  getDisplayText(): string {
    return 'Example View';
  }

  getIcon(): string {
    return 'list';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.createEl('h4', { text: 'Example View' });

    const list = container.createEl('ul');
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files.slice(0, 10)) {
      list.createEl('li', { text: file.basename });
    }
  }

  async onClose(): Promise<void> {
    // 清理 DOM 和事件
  }
}

// 在 Plugin 中注册和使用
export default class MyPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE_EXAMPLE, (leaf) => new ExampleView(leaf));

    this.addRibbonIcon('list', 'Open Example View', () => {
      this.activateView();
    });

    this.addCommand({
      id: 'open-example-view',
      name: 'Open Example View',
      callback: () => this.activateView(),
    });
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_EXAMPLE);
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_EXAMPLE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE_EXAMPLE, active: true });
    }

    workspace.revealLeaf(leaf);
  }
}
```

## 8. HTML 元素创建

```typescript
// 创建元素
const div = containerEl.createEl('div', {
  text: 'Hello',
  cls: 'my-class',
  attr: { id: 'my-id', 'data-value': '42' },
});

// 嵌套创建
const card = containerEl.createEl('div', { cls: 'card' });
card.createEl('h3', { text: 'Title', cls: 'card-title' });
card.createEl('p', { text: 'Description', cls: 'card-desc' });
card.createEl('a', { text: 'Link', href: 'https://example.com' });

// 动态类名
element.toggleClass('active', isActive);
element.addClass('highlight');
element.removeClass('highlight');
```

## 9. 图标系统

```typescript
import { addIcon, setIcon } from 'obsidian';

// 注册自定义 SVG 图标（viewBox 必须是 0 0 100 100）
addIcon('my-icon', `<circle cx="50" cy="50" r="40" fill="currentColor" />`);

// 在功能区使用自定义图标
this.addRibbonIcon('my-icon', 'My Custom Icon', () => {});

// 设置已有元素的图标
const el = document.createElement('span');
setIcon(el, 'star');

// Obsidian 内置图标来自 Lucide: https://lucide.dev
// 常用图标名: star, trash, settings, search, file-text, folder, link, edit, eye, copy
```

## 样式文件（styles.css）

```css
/* 使用 Obsidian CSS 变量确保主题兼容 */
.my-plugin-container {
  padding: 10px;
  background-color: var(--background-primary);
  color: var(--text-normal);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
}

.my-plugin-container h3 {
  color: var(--text-accent);
  margin-bottom: 8px;
}

.my-plugin-container .item {
  padding: 4px 8px;
  cursor: pointer;
  border-radius: var(--radius-s);
}

.my-plugin-container .item:hover {
  background-color: var(--background-modifier-hover);
}

.my-plugin-container .item.active {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}

/* 常用 Obsidian CSS 变量:
  --background-primary          主背景
  --background-secondary         侧边栏背景
  --background-modifier-border   边框
  --background-modifier-hover    悬停背景
  --text-normal                  正常文本
  --text-muted                   次要文本
  --text-accent                  强调色文本
  --interactive-accent           交互强调色
  --text-on-accent               强调色上的文本
  --font-text-size               文本字号
*/
```
