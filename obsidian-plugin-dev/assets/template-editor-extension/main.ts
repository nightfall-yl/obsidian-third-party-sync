import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { createHighlightExtension } from './extension';

// ============================================================
// 设置接口
// ============================================================

interface {{PLUGIN_CLASS}}Settings {
	highlightEnabled: boolean;
	highlightColor: string;
}

const DEFAULT_SETTINGS: {{PLUGIN_CLASS}}Settings = {
	highlightEnabled: true,
	highlightColor: '#ffeb3b',
};

// ============================================================
// 插件主类
// ============================================================

export default class {{PLUGIN_CLASS}} extends Plugin {
	settings: {{PLUGIN_CLASS}}Settings;

	async onload() {
		await this.loadSettings();

		// 注册编辑器扩展
		this.registerEditorExtension(createHighlightExtension(() => this.settings));

		// 命令 — 切换高亮
		this.addCommand({
			id: 'toggle-highlight',
			name: 'Toggle highlight',
			callback: async () => {
				this.settings.highlightEnabled = !this.settings.highlightEnabled;
				await this.saveSettings();
				// 通知编辑器扩展重新计算
				this.app.workspace.updateOptions();
			},
		});

		// 设置面板
		this.addSettingTab(new {{PLUGIN_CLASS}}SettingTab(this.app, this));
	}

	onunload() {
		// 编辑器扩展由 registerEditorExtension 自动管理
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// ============================================================
// 设置面板
// ============================================================

class {{PLUGIN_CLASS}}SettingTab extends PluginSettingTab {
	plugin: {{PLUGIN_CLASS}};

	constructor(app: App, plugin: {{PLUGIN_CLASS}}) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('{{PLUGIN_ID}}-settings');

		new Setting(containerEl)
			.setName('Enable highlight')
			.setDesc('Toggle the editor highlight extension.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.highlightEnabled)
					.onChange(async (value) => {
						this.plugin.settings.highlightEnabled = value;
						await this.plugin.saveSettings();
						this.plugin.app.workspace.updateOptions();
					})
			);

		new Setting(containerEl)
			.setName('Highlight color')
			.setDesc('Choose the highlight color.')
			.addColorPicker((color) =>
				color
					.setValue(this.plugin.settings.highlightColor)
					.onChange(async (value) => {
						this.plugin.settings.highlightColor = value;
						await this.plugin.saveSettings();
						this.plugin.app.workspace.updateOptions();
					})
			);
	}
}
