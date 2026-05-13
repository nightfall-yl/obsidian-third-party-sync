import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import { ExampleView, VIEW_TYPE_EXAMPLE } from './view';
import { {{PLUGIN_CLASS}}Settings, DEFAULT_SETTINGS } from './settings';

// ============================================================
// 插件主类
// ============================================================

export default class {{PLUGIN_CLASS}} extends Plugin {
	settings: {{PLUGIN_CLASS}}Settings;

	async onload() {
		await this.loadSettings();

		// 注册自定义视图
		this.registerView(VIEW_TYPE_EXAMPLE, (leaf) => new ExampleView(leaf, this));

		// 功能区图标 — 点击打开视图
		this.addRibbonIcon('layout-list', '{{PLUGIN_NAME}}', () => {
			this.activateView();
		});

		// 命令 — 打开视图
		this.addCommand({
			id: 'open-view',
			name: 'Open view',
			callback: () => {
				this.activateView();
			},
		});

		// 设置面板
		this.addSettingTab(new {{PLUGIN_CLASS}}SettingTab(this.app, this));
	}

	onunload() {
		// 清理视图
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
			if (!leaf) {
				return;
			}

			await leaf.setViewState({
				type: VIEW_TYPE_EXAMPLE,
				active: true,
			});
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
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
			.setName('Display count')
			.setDesc('Number of items to display in the view.')
			.addSlider((slider) =>
				slider
					.setLimits(5, 50, 5)
					.setValue(this.plugin.settings.displayCount)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.displayCount = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Show path')
			.setDesc('Show file path in the view.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showPath)
					.onChange(async (value) => {
						this.plugin.settings.showPath = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
