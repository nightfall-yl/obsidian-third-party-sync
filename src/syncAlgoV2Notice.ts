import { App, Modal, Setting } from "obsidian";
import type { I18n } from "./i18n";

export class SyncAlgoV2Modal extends Modal {
  result: boolean;
  onSubmit: (result: boolean) => void;
  i18n: I18n;

  constructor(app: App, i18n: I18n, onSubmit: (result: boolean) => void) {
    super(app);
    this.i18n = i18n;
    this.result = false;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    let { contentEl } = this;

    contentEl.createEl("h2", {
      text: this.i18n.t("syncalgov2_title"),
    });

    this.i18n.t("syncalgov2_texts")
      .split("\n")
      .forEach((val) => {
        const p = contentEl.createEl("p");
        // Parse Markdown-style links [text](url) and create real <a> elements
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = linkRegex.exec(val)) !== null) {
          if (match.index > lastIndex) {
            p.createSpan({ text: val.substring(lastIndex, match.index) });
          }
          p.createEl("a", {
            text: match[1],
            href: match[2],
          });
          lastIndex = match.index + match[0].length;
        }
        if (lastIndex < val.length) {
          p.createSpan({ text: val.substring(lastIndex) });
        }
      });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText(this.i18n.t("syncalgov2_button_agree"));
        button.onClick(async () => {
          this.result = true;
          this.close();
        });
      })
      .addButton((button) => {
        button.setButtonText(this.i18n.t("syncalgov2_button_disagree"));
        button.onClick(() => {
          this.close();
        });
      });
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();

    this.onSubmit(this.result);
  }
}
