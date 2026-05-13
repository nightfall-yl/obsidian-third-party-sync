# CM6 编辑器扩展开发指南

## 概述

Obsidian 使用 CodeMirror 6 (CM6) 作为编辑器引擎。编辑器扩展用于修改**编辑模式**下的外观和行为。如需修改**阅读模式**，请使用 Markdown 后处理器。

### 注册扩展

```typescript
// 在 Plugin.onload() 中注册
this.registerEditorExtension([myViewPlugin, myStateField]);
```

### 访问 EditorView

```typescript
// 从 editorCallback 中访问
this.addCommand({
  id: 'my-command',
  name: 'My Command',
  editorCallback: (editor, view) => {
    // @ts-expect-error - cm 属性未公开类型
    const editorView = view.editor.cm as EditorView;
    // 现在可以使用 CM6 API
  },
});
```

## State Field（状态字段）

管理独立于文档的自定义状态。适用于：计数器、标记集合、UI 状态切换等。

### State Effect（状态效果）

```typescript
import { StateEffect } from '@codemirror/state';

// 定义效果（类似"方法声明"）
const toggleEffect = StateEffect.define<boolean>();
const addItemEffect = StateEffect.define<string>();
const removeItemEffect = StateEffect.define<string>();
```

### 完整 State Field 示例

```typescript
import { StateField, StateEffect, EditorState, Transaction } from '@codemirror/state';

// 1. 定义效果
const addEffect = StateEffect.define<number>();
const resetEffect = StateEffect.define<void>();

// 2. 定义状态字段
export const counterField = StateField.define<number>({
  // 初始状态
  create(state: EditorState): number {
    return 0;
  },

  // 状态更新逻辑
  update(currentValue: number, transaction: Transaction): number {
    let newValue = currentValue;

    for (const effect of transaction.effects) {
      if (effect.is(addEffect)) {
        newValue += effect.value;
      } else if (effect.is(resetEffect)) {
        newValue = 0;
      }
    }

    return newValue;
  },
});

// 3. 辅助函数
export function addToCounter(view: EditorView, amount: number) {
  view.dispatch({ effects: [addEffect.of(amount)] });
}

export function resetCounter(view: EditorView) {
  view.dispatch({ effects: [resetEffect.of()] });
}

// 4. 读取状态
function getCounterValue(view: EditorView): number {
  return view.state.field(counterField);
}
```

## View Plugin（视图插件）

响应视口变化和 DOM 操作。适用于：根据可见范围构建装饰、处理 DOM 事件等。

### 基础 View Plugin

```typescript
import { ViewUpdate, PluginValue, EditorView, ViewPlugin } from '@codemirror/view';

class WordCountPlugin implements PluginValue {
  statusEl: HTMLElement | null = null;

  constructor(view: EditorView) {
    this.updateCount(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet) {
      this.updateCount(update.view);
    }
  }

  updateCount(view: EditorView) {
    const text = view.state.doc.toString();
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    console.log(`Words: ${wordCount}`);
  }

  destroy() {
    // 清理资源
  }
}

export const wordCountPlugin = ViewPlugin.fromClass(WordCountPlugin);
```

### 带装饰的 View Plugin

```typescript
import {
  ViewUpdate, PluginValue, EditorView, ViewPlugin,
  Decoration, DecorationSet, PluginSpec,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

class HighlightPlugin implements PluginValue {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();

    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from,
        to,
        enter(node) {
          // 高亮所有标题节点
          if (node.type.name.startsWith('ATXHeading')) {
            builder.add(
              node.from,
              node.to,
              Decoration.mark({ class: 'my-highlight' })
            );
          }
        },
      });
    }

    return builder.finish();
  }

  destroy() {}
}

// 关键：通过 pluginSpec 声明 decorations 属性
const pluginSpec: PluginSpec<HighlightPlugin> = {
  decorations: (value: HighlightPlugin) => value.decorations,
};

export const highlightPlugin = ViewPlugin.fromClass(HighlightPlugin, pluginSpec);
```

## Decoration（装饰）

四种装饰类型，可通过 State Field 或 View Plugin 提供。

### Mark Decoration（标记装饰）

为文本范围添加 CSS 类。

```typescript
const markDecoration = Decoration.mark({
  class: 'my-highlight',
  attributes: { title: 'Highlighted text' },
});
// 使用: builder.add(from, to, markDecoration);
```

### Widget Decoration（小部件装饰）

在文档中插入自定义 HTML 元素。

```typescript
import { WidgetType, EditorView, Decoration } from '@codemirror/view';

class EmojiWidget extends WidgetType {
  constructor(readonly emoji: string) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement('span');
    span.innerText = this.emoji;
    span.className = 'emoji-widget';
    return span;
  }

  // 避免不必要的重绘
  eq(other: EmojiWidget): boolean {
    return this.emoji === other.emoji;
  }
}

// 在光标位置插入（不替换内容）
const widgetDecoration = Decoration.widget({
  widget: new EmojiWidget(''),
  side: 1, // 1=在光标后, -1=在光标前
});
```

### Replace Decoration（替换装饰）

隐藏或替换文档内容。

```typescript
// 替换为小部件
const replaceWithWidget = Decoration.replace({
  widget: new EmojiWidget(''),
});
// builder.add(from, to, replaceWithWidget); // 替换 from~to 范围的内容

// 折叠（隐藏内容）
const foldDecoration = Decoration.replace({});
// builder.add(from, to, foldDecoration); // 隐藏 from~to 范围
```

### Line Decoration（行装饰）

为整行添加 CSS 类。

```typescript
const lineDecoration = Decoration.line({
  class: 'highlighted-line',
  attributes: { 'data-line-type': 'important' },
});
// 使用: builder.add(lineStart, lineStart, lineDecoration);
// 注意: from 和 to 都是行起始位置
```

### 通过 State Field 提供装饰

适用于装饰依赖全文档状态的场景。

```typescript
import { StateField, Extension } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet } from '@codemirror/view';

export const decorationField = StateField.define<DecorationSet>({
  create(): DecorationSet {
    return Decoration.none;
  },

  update(decorations, transaction): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();

    syntaxTree(transaction.state).iterate({
      enter(node) {
        if (node.type.name === 'InlineCode') {
          builder.add(
            node.from,
            node.to,
            Decoration.mark({ class: 'inline-code-highlight' })
          );
        }
      },
    });

    return builder.finish();
  },

  // 关键：通过 provide 暴露给编辑器
  provide(field: StateField<DecorationSet>): Extension {
    return EditorView.decorations.from(field);
  },
});
```

## State Management（状态管理）

### Transaction（事务）

```typescript
// 派发文本变更
view.dispatch({
  changes: { from: 0, insert: '# ' },
});

// 批量变更
view.dispatch({
  changes: [
    { from: selectionStart, insert: '**' },
    { from: selectionEnd, insert: '**' },
  ],
});

// 同时派发变更和效果
view.dispatch({
  changes: { from: 0, to: 5, insert: 'Hello' },
  effects: [myEffect.of(someValue)],
});
```

### 访问状态

```typescript
// 获取文档内容
const text = view.state.doc.toString();

// 获取行信息
const line = view.state.doc.lineAt(pos);
console.log(line.number, line.from, line.to, line.text);

// 获取选区
const selection = view.state.selection.main;
const selectedText = view.state.sliceDoc(selection.from, selection.to);

// 获取可见范围
for (const { from, to } of view.visibleRanges) {
  // 仅处理可见部分，优化性能
}
```

## Markdown 后处理器

用于修改**阅读模式**的渲染结果。

### 基础后处理器

```typescript
this.registerMarkdownPostProcessor((element, context) => {
  // element: 渲染后的 DOM 元素
  // context: MarkdownPostProcessorContext

  const codeBlocks = element.querySelectorAll('code');
  for (let i = 0; i < codeBlocks.length; i++) {
    const code = codeBlocks.item(i);
    const text = code.innerText.trim();

    // 示例：将 :emoji_name: 替换为实际 emoji
    if (/^:\w+:$/.test(text)) {
      const emoji = lookupEmoji(text);
      if (emoji) {
        code.replaceWith(emoji);
      }
    }
  }
});
```

### 自定义代码块处理器

```typescript
// 处理 ```csv 代码块
this.registerMarkdownCodeBlockProcessor('csv', (source, el, ctx) => {
  const rows = source.split('\n').filter((row) => row.length > 0);
  const table = el.createEl('table');
  const body = table.createEl('tbody');

  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i].split(',');
    const row = body.createEl('tr');
    for (let j = 0; j < cols.length; j++) {
      row.createEl(i === 0 ? 'th' : 'td', { text: cols[j].trim() });
    }
  }
});
```

### 带子组件的后处理器

```typescript
this.registerMarkdownPostProcessor((element, context) => {
  const items = element.querySelectorAll('.special-item');
  for (let i = 0; i < items.length; i++) {
    // 使用 addChild 确保组件生命周期管理
    context.addChild(new SpecialComponent(items.item(i) as HTMLElement));
  }
});

class SpecialComponent extends MarkdownRenderChild {
  constructor(containerEl: HTMLElement) {
    super(containerEl);
  }

  onload() {
    // 组件加载时
    this.containerEl.createEl('span', { text: 'Enhanced!' });
  }

  onunload() {
    // 组件卸载时清理
  }
}
```

## EditorSuggest（编辑器建议）

提供编辑器内自动补全。

```typescript
import { EditorSuggest, EditorPosition, Editor, TFile, EditorSuggestTriggerInfo, EditorSuggestContext } from 'obsidian';

interface Suggestion {
  label: string;
  value: string;
}

class MySuggest extends EditorSuggest<Suggestion> {
  // 触发条件
  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    const sub = line.substring(0, cursor.ch);

    // 当输入 @: 时触发
    const match = sub.match(/@(\w*)$/);
    if (match) {
      return {
        start: { line: cursor.line, ch: cursor.ch - match[0].length },
        end: cursor,
        query: match[1],
      };
    }
    return null;
  }

  // 获取建议列表
  getSuggestions(context: EditorSuggestContext): Suggestion[] {
    const items: Suggestion[] = [
      { label: 'Today', value: new Date().toISOString().split('T')[0] },
      { label: 'Now', value: new Date().toLocaleTimeString() },
    ];
    return items.filter((item) =>
      item.label.toLowerCase().includes(context.query.toLowerCase())
    );
  }

  // 渲染建议项
  renderSuggestion(suggestion: Suggestion, el: HTMLElement): void {
    el.createEl('div', { text: suggestion.label });
    el.createEl('small', { text: suggestion.value, cls: 'suggestion-note' });
  }

  // 选中建议项
  selectSuggestion(suggestion: Suggestion, evt: MouseEvent | KeyboardEvent): void {
    if (this.context) {
      this.context.editor.replaceRange(
        suggestion.value,
        this.context.start,
        this.context.end
      );
    }
  }
}

// 注册
this.registerEditorSuggest(new MySuggest(this.app));
```

## 扩展选择指南

| 需求 | 推荐方案 | 原因 |
|------|----------|------|
| 自定义状态管理 | State Field | 独立于视口，全文档范围 |
| 基于可见范围的装饰 | View Plugin + Decoration | 性能最优，仅处理可见区域 |
| 基于全文档的装饰 | State Field + Decoration | 需要遍历整个文档 |
| 编辑模式外观修改 | Decoration (Mark/Widget/Replace/Line) | CM6 标准方案 |
| 阅读模式外观修改 | registerMarkdownPostProcessor | 非 CM6，操作 DOM |
| 自定义代码块渲染 | registerMarkdownCodeBlockProcessor | 专门处理代码块 |
| 编辑器自动补全 | EditorSuggest / registerEditorSuggest | Obsidian 封装的补全 API |
| 响应编辑器事件 | editorCallback / editor-change 事件 | 简单场景无需 CM6 |
