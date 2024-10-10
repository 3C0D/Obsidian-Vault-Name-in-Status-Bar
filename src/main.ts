import { Plugin } from "obsidian";
import { Settings } from "./settings";
import { vaultsMenu } from "./menu";
import { chevrons, DEFAULT_SETTINGS } from "./variables";
import { SBVNSettings } from "./interfaces";




export default class StatusBarVaultName extends Plugin {
	settings: SBVNSettings
	title: HTMLDivElement


	async onload() {
		await this.loadSettings();
		this.addSettingTab(new Settings(this.app, this));
		const vaultName = this.app.vault.getName();
		const statusBar = document.querySelector('.status-bar')
		this.title = document.createElement('div');
		statusBar?.prepend(this.title)
		this.title.innerHTML = this.settings.reducedAtStart ? `${chevrons}`:`${chevrons} ${vaultName}`;
		this.title.classList.add("status-bar-vault-name");
		this.updateTitleStyle();
		this.title.addEventListener('click', (e) => vaultsMenu(this, this.app, e));
	}

	onunload() {
		this.title.detach()

	}
	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.updateTitleStyle();
		this.updateVaultName()
	}
	
	updateTitleStyle() {
		this.title.style.color = this.settings.color;
		this.title.style.fontSize = `${this.settings.fontSize}em`;
	}

	updateVaultName() {
		this.title.innerHTML = this.settings.reducedAtStart ? `${chevrons}` : `${chevrons} ${this.getTruncatedVaultName(this.app.vault.getName())}`;
    }

    getTruncatedVaultName(name: string): string {
        if (this.settings.enableMaxLength && name.length > this.settings.maxTitleLength) {
            return name.slice(0, this.settings.maxTitleLength) + '...';
        }
        return name;
    }
}