import type { SBVNSettings } from "./interfaces.ts";
import { chevronsVertical } from "./variables.ts";

export class VaultName {
	private vaultNameEl: HTMLDivElement;

	constructor(
		private getSettings: () => SBVNSettings,
		private getVaultName: () => string
	) {
		this.vaultNameEl = document.createElement('div');
	}

	init(statusBar: Element | null): void {
		const settings = this.getSettings();
		this.vaultNameEl.innerHTML = settings.reducedAtStart ? `${chevronsVertical}` : `${chevronsVertical} ${this.getTruncatedName(this.getVaultName())}`;
		this.vaultNameEl.classList.add("status-bar-vault-name");
		this.updateTooltip();
		statusBar?.prepend(this.vaultNameEl);
		this.updateStyle();
		this.updateVisibility();
	}

	getEl(): HTMLDivElement {
		return this.vaultNameEl;
	}

	updateStyle(): void {
		const settings = this.getSettings();
		this.vaultNameEl.style.color = settings.color;
		this.vaultNameEl.style.fontSize = `${settings.fontSize}em`;
	}

	updateName(): void {
		const settings = this.getSettings();
		this.vaultNameEl.innerHTML = settings.reducedAtStart ? `${chevronsVertical}` : `${chevronsVertical} ${this.getTruncatedName(this.getVaultName())}`;
	}

	updateTooltip(): void {
		this.vaultNameEl.setAttribute('aria-label', "vault name");
	}

	updateVisibility(): void {
		const settings = this.getSettings();
		this.vaultNameEl.style.display = settings.enableVaultName ? 'flex' : 'none';
	}

	getTruncatedName(name: string): string {
		const settings = this.getSettings();
		if (settings.enableMaxLength && name.length > settings.maxVaultNameLength) {
			return name.slice(0, settings.maxVaultNameLength) + '...';
		}
		return name;
	}
}
