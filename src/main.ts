import { Plugin } from "obsidian";
import { Settings } from "./settings.ts";
import { vaultsMenu } from "./menu.ts";
import { chevrons, DEFAULT_SETTINGS } from "./variables.ts";
import type { SBVNSettings } from "./interfaces.ts";

export default class StatusBarVaultName extends Plugin {
	settings: SBVNSettings;
	title: HTMLDivElement;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new Settings(this.app, this));
		const vaultName = this.app.vault.getName();
		const statusBar = document.querySelector('.status-bar');
		this.title = document.createElement('div');
		statusBar?.prepend(this.title);
		this.title.innerHTML = this.settings.reducedAtStart ? `${chevrons}`:`${chevrons} ${vaultName}`;
		this.title.classList.add("status-bar-vault-name");
		this.updateTitleStyle();
		this.title.addEventListener('click', (e) => vaultsMenu(this, this.app, e));
	}

	onunload(): void {
		this.title.detach();

	}
	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.updateTitleStyle();
		this.updateVaultName();
	}

	updateTitleStyle(): void {
		this.title.style.color = this.settings.color;
		this.title.style.fontSize = `${this.settings.fontSize}em`;
	}

	updateVaultName(): void {
		this.title.innerHTML = this.settings.reducedAtStart ? `${chevrons}` : `${chevrons} ${this.getTruncatedVaultName(this.app.vault.getName())}`;
    }

    getTruncatedVaultName(name: string): string {
        if (this.settings.enableMaxLength && name.length > this.settings.maxTitleLength) {
            return name.slice(0, this.settings.maxTitleLength) + '...';
        }
        return name;
    }
}