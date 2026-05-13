# Obsidian API 速查参考

## 核心类

### Plugin（插件基类）

```typescript
class Plugin extends Component {
  app: App;
  manifest: PluginManifest;

  // 生命周期
  onload(): void;
  onunload(): void;

  // 数据持久化
  loadData(): Promise<any>;
  saveData(data: any): Promise<void>;

  // UI 注册
  addRibbonIcon(icon: IconName, title: string, callback: (evt: MouseEvent) => any): HTMLElement;
  addStatusBarItem(): HTMLElement;
  addCommand(command: Command): Command;
  addSettingTab(settingTab: PluginSettingTab): void;

  // 视图与扩展
  registerView(type: string, viewCreator: ViewCreator): void;
  registerExtensions(extensions: string[], viewType: string): void;
  registerMarkdownPostProcessor(postProcessor: MarkdownPostProcessor, sortOrder?: number): MarkdownPostProcessor;
  registerMarkdownCodeBlockProcessor(language: string, handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => Promise<any> | void, sortOrder?: number): MarkdownPostProcessor;
  registerEditorExtension(extension: Extension): void;
  registerEditorSuggest(editorSuggest: EditorSuggest<any>): void;
}
```

### App（应用核心）

```typescript
class App {
  vault: Vault;
  workspace: Workspace;
  metadataCache: MetadataCache;
  fileManager: FileManager;
  keymap: Keymap;
  scope: Scope;
  lastEvent: UserEvent;
}
```

### Vault（文件操作）

```typescript
class Vault extends Events {
  // 查询
  getName(): string;
  getRoot(): TFolder;
  getAbstractFileByPath(path: string): TAbstractFile | null;
  getAllLoadedFiles(): TAbstractFile[];
  getMarkdownFiles(): TFile[];
  getFiles(): TFile[];

  // 读取
  read(file: TFile): Promise<string>;
  cachedRead(file: TFile): Promise<string>;
  readBinary(file: TFile): Promise<ArrayBuffer>;

  // 写入
  create(path: string, data: string, options?: DataWriteOptions): Promise<TFile>;
  createBinary(path: string, data: ArrayBuffer, options?: DataWriteOptions): Promise<TFile>;
  createFolder(path: string): Promise<void>;
  modify(file: TFile, data: string, options?: DataWriteOptions): Promise<void>;
  modifyBinary(file: TFile, data: ArrayBuffer, options?: DataWriteOptions): Promise<void>;
  append(file: TFile, data: string, options?: DataWriteOptions): Promise<void>;
  process(file: TFile, fn: (data: string) => string, options?: DataWriteOptions): Promise<string>;

  // 管理
  copy(file: TFile, newPath: string): Promise<TFile>;
  rename(file: TAbstractFile, newPath: string): Promise<void>;
  delete(file: TAbstractFile, force?: boolean): Promise<void>;
  trash(file: TAbstractFile, system: boolean): Promise<void>;

  // 事件
  on(name: 'create', callback: (file: TAbstractFile) => any): EventRef;
  on(name: 'modify', callback: (file: TAbstractFile) => any): EventRef;
  on(name: 'delete', callback: (file: TAbstractFile) => any): EventRef;
  on(name: 'rename', callback: (file: TAbstractFile, oldPath: string) => any): EventRef;
}
```

### Workspace（工作区）

```typescript
class Workspace extends Events {
  // 属性
  activeLeaf: WorkspaceLeaf;
  activeEditor: MarkdownFileInfo;
  layoutReady: boolean;
  leftSplit: WorkspaceSidedock | WorkspaceMobileDrawer;
  rightSplit: WorkspaceSidedock | WorkspaceMobileDrawer;

  // 活跃状态
  getActiveFile(): TFile | null;
  getActiveViewOfType<T extends View>(type: Constructor<T>): T | null;

  // Leaf 管理
  getLeaf(newLeaf?: PaneType | boolean): WorkspaceLeaf;
  getLeftLeaf(split: boolean): WorkspaceLeaf;
  getRightLeaf(split: boolean): WorkspaceLeaf;
  getLeafById(id: string): WorkspaceLeaf;
  getLeavesOfType(viewType: string): WorkspaceLeaf[];
  detachLeavesOfType(viewType: string): void;

  // 导航
  openLinkText(linktext: string, sourcePath: string, newLeaf?: PaneType | boolean): Promise<void>;
  setActiveLeaf(leaf: WorkspaceLeaf, params?: { focus?: boolean }): void;
  revealLeaf(leaf: WorkspaceLeaf): void;

  // 遍历
  iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => any): void;
  iterateRootLeaves(callback: (leaf: WorkspaceLeaf) => any): void;

  // 布局
  onLayoutReady(callback: () => any): void;

  // 事件
  on(name: 'active-leaf-change', callback: (leaf: WorkspaceLeaf | null) => any): EventRef;
  on(name: 'file-open', callback: (file: TFile | null) => any): EventRef;
  on(name: 'layout-change', callback: () => any): EventRef;
  on(name: 'file-menu', callback: (menu: Menu, file: TAbstractFile, source: string, leaf?: WorkspaceLeaf) => any): EventRef;
  on(name: 'editor-menu', callback: (menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo) => any): EventRef;
  on(name: 'editor-change', callback: (editor: Editor, info: MarkdownView | MarkdownFileInfo) => any): EventRef;
  on(name: 'editor-paste', callback: (evt: ClipboardEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) => any): EventRef;
  on(name: 'editor-drop', callback: (evt: DragEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) => any): EventRef;
  on(name: 'css-change', callback: () => any): EventRef;
  on(name: 'quit', callback: (tasks: Tasks) => any): EventRef;
}
```

### Editor（编辑器）

```typescript
class Editor {
  // 文本读写
  getValue(): string;
  setValue(content: string): void;
  getLine(line: number): string;
  setLine(n: number, text: string): void;
  lineCount(): number;
  lastLine(): number;

  // 选区
  getSelection(): string;
  getRange(from: EditorPosition, to: EditorPosition): string;
  replaceSelection(replacement: string, origin?: string): void;
  replaceRange(replacement: string, from: EditorPosition, to?: EditorPosition, origin?: string): void;

  // 光标
  getCursor(string?: 'from' | 'to' | 'head' | 'anchor'): EditorPosition;
  setCursor(pos: EditorPosition | number, ch?: number): void;
  listSelections(): EditorSelection[];
  setSelection(anchor: EditorPosition, head?: EditorPosition): void;
  setSelections(ranges: EditorSelectionOrCaret[], main?: number): void;

  // 焦点
  focus(): void;
  blur(): void;
  hasFocus(): boolean;

  // 滚动
  getScrollInfo(): { top: number; left: number };
  scrollTo(x?: number | null, y?: number | null): void;
  scrollIntoView(range: EditorRange, center?: boolean): void;

  // 编辑
  undo(): void;
  redo(): void;
  exec(command: EditorCommandName): void;
  transaction(tx: EditorTransaction, origin?: string): void;

  // 工具
  wordAt(pos: EditorPosition): EditorRange | null;
  posToOffset(pos: EditorPosition): number;
  offsetToPos(offset: number): EditorPosition;
}
```

### MetadataCache（元数据缓存）

```typescript
class MetadataCache extends Events {
  resolvedLinks: Record<string, Record<string, number>>;
  unresolvedLinks: Record<string, Record<string, number>>;

  getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
  getFileCache(file: TFile): CachedMetadata | null;
  getCache(path: string): CachedMetadata | null;
  fileToLinktext(file: TFile, sourcePath: string, omitMdExtension?: boolean): string;

  on(name: 'changed', callback: (file: TFile, data: string, cache: CachedMetadata) => any): EventRef;
  on(name: 'deleted', callback: (file: TFile, prevCache: CachedMetadata | null) => any): EventRef;
  on(name: 'resolve', callback: (file: TFile) => any): EventRef;
  on(name: 'resolved', callback: () => any): EventRef;
}
```

### Component（组件基类）

```typescript
class Component {
  load(): void;
  onload(): void;
  unload(): void;
  onunload(): void;

  addChild<T extends Component>(component: T): T;
  removeChild<T extends Component>(component: T): T;
  register(cb: () => any): void;
  registerEvent(eventRef: EventRef): void;
  registerDomEvent<K extends keyof HTMLElementEventMap>(
    el: HTMLElement, type: K, callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void;
  registerInterval(id: number): number;
}
```

## UI 组件类

### Modal（模态框）

```typescript
class Modal {
  app: App;
  containerEl: HTMLElement;
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  contentEl: HTMLElement;

  open(): void;
  close(): void;
  onOpen(): void;   // 覆写
  onClose(): void;  // 覆写
}
```

### SuggestModal<T>（建议列表模态框）

```typescript
abstract class SuggestModal<T> extends Modal {
  abstract getSuggestions(query: string): T[] | Promise<T[]>;
  abstract renderSuggestion(value: T, el: HTMLElement): void;
  abstract onChooseSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void;
}
```

### FuzzySuggestModal<T>（模糊搜索模态框）

```typescript
abstract class FuzzySuggestModal<T> extends SuggestModal<FuzzyMatch<T>> {
  abstract getItems(): T[];
  abstract getItemText(item: T): string;
  abstract onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void;
}
```

### Setting（设置项）

```typescript
class Setting {
  constructor(containerEl: HTMLElement);
  setName(name: string | DocumentFragment): this;
  setDesc(desc: string | DocumentFragment): this;
  setClass(cls: string): this;
  setTooltip(tooltip: string): this;
  setHeading(): this;
  setDisabled(disabled: boolean): this;
  addButton(cb: (component: ButtonComponent) => any): this;
  addToggle(cb: (component: ToggleComponent) => any): this;
  addText(cb: (component: TextComponent) => any): this;
  addTextArea(cb: (component: TextAreaComponent) => any): this;
  addDropdown(cb: (component: DropdownComponent) => any): this;
  addColorPicker(cb: (component: ColorComponent) => any): this;
  addSlider(cb: (component: SliderComponent) => any): this;
  addSearch(cb: (component: SearchComponent) => any): this;
}
```

### Notice（通知）

```typescript
class Notice {
  constructor(message: string | DocumentFragment, timeout?: number);
  setMessage(message: string | DocumentFragment): this;
  hide(): void;
}
```

### Menu（菜单）

```typescript
class Menu {
  addItem(cb: (item: MenuItem) => any): this;
  addSeparator(): this;
  showAtMouseEvent(evt: MouseEvent): this;
  showAtPosition(position: MenuPositionDef): this;
  hide(): this;
}
```

### View / ItemView（视图基类）

```typescript
abstract class View extends Component {
  app: App;
  icon: string;
  navigation: boolean;
  leaf: WorkspaceLeaf;
  containerEl: HTMLElement;

  abstract getViewType(): string;
  abstract getDisplayText(): string;
  getIcon(): IconName;
  onOpen(): Promise<void>;
  onClose(): Promise<void>;
  getState(): any;
  setState(state: any, result: ViewStateResult): Promise<void>;
  onPaneMenu(menu: Menu, source: string): void;
}

class ItemView extends View {
  contentEl: HTMLElement;
  // 继承 View 的所有方法
}
```

### WorkspaceLeaf（窗格叶子）

```typescript
class WorkspaceLeaf extends Component {
  view: View;
  openFile(file: TFile, openState?: OpenViewState): Promise<void>;
  open(view: View): Promise<View>;
  getViewState(): ViewState;
  setViewState(viewState: ViewState, eState?: any): Promise<void>;
  detach(): void;
  togglePinned(): void;
  setPinned(pinned: boolean): void;
  setGroup(group: string): void;
}
```

## 核心接口

### Command

```typescript
interface Command {
  id: string;
  name: string;
  icon?: string;
  mobileOnly?: boolean;
  repeatable?: boolean;
  callback?: () => any;
  checkCallback?: (checking: boolean) => boolean | void;
  editorCallback?: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => any;
  editorCheckCallback?: (checking: boolean, editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => boolean | void;
  hotkeys?: Hotkey[];
}
```

### PluginManifest

```typescript
interface PluginManifest {
  dir: string;
  id: string;
  name: string;
  author: string;
  version: string;
  minAppVersion: string;
  description: string;
  authorUrl?: string;
  isDesktopOnly?: boolean;
}
```

### CachedMetadata

```typescript
interface CachedMetadata {
  links?: LinkCache[];
  embeds?: EmbedCache[];
  tags?: TagCache[];
  headings?: HeadingCache[];
  sections?: SectionCache[];
  listItems?: ListItemCache[];
  frontmatter?: FrontMatterCache;
  blocks?: Record<string, BlockCache>;
}
```

### EditorPosition / EditorRange

```typescript
interface EditorPosition { line: number; ch: number; }
interface EditorRange { from: EditorPosition; to: EditorPosition; }
```

### ViewState

```typescript
interface ViewState { type: string; state?: any; active?: boolean; pinned?: boolean; }
```

## 常用函数

### HTTP 请求

```typescript
function requestUrl(request: RequestUrlParam | string): RequestUrlResponsePromise;
// 类似 fetch()，无跨域限制
```

### 图标操作

```typescript
function addIcon(iconId: string, svgContent: string): void;    // viewBox="0 0 100 100"
function setIcon(parent: HTMLElement, iconId: string): void;
function removeIcon(iconId: string): void;
function getIconIds(): string[];
```

### DOM 创建

```typescript
function createEl<K extends keyof HTMLElementTagNameMap>(tag: K, o?: DomElementInfo): HTMLElementTagNameMap[K];
function createDiv(o?: DomElementInfo): HTMLDivElement;
function createSpan(o?: DomElementInfo): HTMLSpanElement;
function createFragment(): DocumentFragment;
```

### 数据转换

```typescript
function arrayBufferToBase64(buffer: ArrayBuffer): string;
function base64ToArrayBuffer(base64: string): ArrayBuffer;
function arrayBufferToHex(buffer: ArrayBuffer): string;
function hexToArrayBuffer(hex: string): ArrayBuffer;
```

### 搜索

```typescript
function fuzzySearch(q: PreparedQuery, text: string): SearchResult | null;
function prepareFuzzySearch(query: string): (text: string) => SearchResult | null;
function prepareSimpleSearch(query: string): (text: string) => SearchResult | null;
```

### YAML

```typescript
function parseYaml(yaml: string): any;
function stringifyYaml(obj: any): string;
```

### 链接解析

```typescript
function parseLinktext(linktext: string): { path: string; subpath: string };
function getLinkpath(linktext: string): string;
```

### 工具

```typescript
function normalizePath(path: string): string;   // 必须用于所有文件路径
function debounce<T extends unknown[]>(cb: (...args: T) => any, timeout?: number, resetTimer?: boolean): Debouncer<T>;
function requireApiVersion(version: string): boolean;

// Platform 检测
namespace Platform {
  const isMobile: boolean;
  const isDesktop: boolean;
  const isDesktopApp: boolean;
  const isMobileApp: boolean;
}
```

## 文件类型

```typescript
class TAbstractFile { vault: Vault; path: string; name: string; parent: TFolder; }
class TFile extends TAbstractFile { stat: FileStats; basename: string; extension: string; }
class TFolder extends TAbstractFile { children: TAbstractFile[]; isRoot(): boolean; }

interface FileStats { ctime: number; mtime: number; size: number; }
```
