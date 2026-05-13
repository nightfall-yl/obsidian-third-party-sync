import {
	ViewUpdate,
	PluginValue,
	EditorView,
	ViewPlugin,
	Decoration,
	DecorationSet,
	PluginSpec,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { ExampleWidget } from './widget';

export interface HighlightSettings {
	highlightEnabled: boolean;
	highlightColor: string;
}

// ============================================================
// View Plugin — 基于可见行的装饰
// ============================================================

class HighlightPlugin implements PluginValue {
	decorations: DecorationSet;
	private getSettings: () => HighlightSettings;

	constructor(view: EditorView, getSettings: () => HighlightSettings) {
		this.getSettings = getSettings;
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		this.decorations = this.buildDecorations(update.view);
	}

	/**
	 * 遍历可见行，为 Markdown 列表符号添加 widget 装饰。
	 * 可根据需求替换为其他行级或范围级匹配逻辑。
	 */
	buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		const settings = this.getSettings();

		if (!settings.highlightEnabled) {
			return builder.finish();
		}

		for (const { from, to } of view.visibleRanges) {
			let pos = from;
			while (pos <= to) {
				const line = view.state.doc.lineAt(pos);
				const match = line.text.match(/^(\s*)[-*+] /);

				if (match) {
					const markerFrom = line.from + match[1].length;
					builder.add(
						markerFrom,
						markerFrom + 1,
						Decoration.replace({
							widget: new ExampleWidget(settings.highlightColor),
						})
					);
				}

				if (line.to >= to) break;
				pos = line.to + 1;
			}
		}

		return builder.finish();
	}

	destroy() {
		// 清理资源
	}
}

// ============================================================
// 导出扩展
// ============================================================

const pluginSpec: PluginSpec<HighlightPlugin> = {
	decorations: (value: HighlightPlugin) => value.decorations,
};

export const createHighlightExtension = (getSettings: () => HighlightSettings) =>
	ViewPlugin.define((view) => new HighlightPlugin(view, getSettings), pluginSpec);
