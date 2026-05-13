import { EditorView, WidgetType } from '@codemirror/view';

// ============================================================
// Widget — 自定义内联小部件
// ============================================================

export class ExampleWidget extends WidgetType {
	constructor(private color: string) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		const span = document.createElement('span');
		span.innerText = '•';
		span.className = '{{PLUGIN_ID}}-widget';
		span.style.color = this.color;
		return span;
	}

	/**
	 * 比较两个 widget 是否相同，避免不必要的 DOM 重建。
	 */
	eq(other: ExampleWidget): boolean {
		return this.color === other.color;
	}
}
