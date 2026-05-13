import { ItemView, WorkspaceLeaf } from 'obsidian';
import type {{PLUGIN_CLASS}} from './main';

export const VIEW_TYPE_EXAMPLE = '{{PLUGIN_ID}}-view';

export class ExampleView extends ItemView {
	plugin: {{PLUGIN_CLASS}};

	constructor(leaf: WorkspaceLeaf, plugin: {{PLUGIN_CLASS}}) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_EXAMPLE;
	}

	getDisplayText(): string {
		return '{{PLUGIN_NAME}}';
	}

	getIcon(): string {
		return 'layout-list';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('{{PLUGIN_ID}}-view-container');

		// 标题
		container.createEl('h4', { text: '{{PLUGIN_NAME}}' });

		// 文件列表
		this.renderFileList(container as HTMLElement);

		// 监听文件变化以刷新视图
		this.registerEvent(
			this.app.vault.on('modify', () => {
				this.renderFileList(container as HTMLElement);
			})
		);
	}

	async onClose(): Promise<void> {
		// 清理资源
	}

	private renderFileList(container: HTMLElement): void {
		// 移除旧列表
		const oldList = container.querySelector('.file-list');
		if (oldList) oldList.remove();

		const listEl = container.createEl('ul', { cls: 'file-list' });
		const files = this.app.vault.getMarkdownFiles()
			.sort((a, b) => b.stat.mtime - a.stat.mtime)
			.slice(0, this.plugin.settings.displayCount);

		for (const file of files) {
			const itemEl = listEl.createEl('li', { cls: 'file-item' });
			itemEl.createEl('span', {
				text: file.basename,
				cls: 'file-name',
			});

			if (this.plugin.settings.showPath) {
				itemEl.createEl('small', {
					text: file.path,
					cls: 'file-path',
				});
			}

			// 点击打开文件
			this.registerDomEvent(itemEl, 'click', () => {
				this.app.workspace.openLinkText(file.path, '', false);
			});
		}
	}
}
