import type { SBVNSettings } from "./interfaces.ts";
import { setIcon, type Plugin } from "obsidian";

export class VaultName {
	private vaultNameEl: HTMLDivElement;

	constructor(
		private getSettings: () => SBVNSettings,
		private getVaultName: () => string,
		statusBar: Element | null,
		private registerDomEvent: Plugin["registerDomEvent"],
		private vaultsMenu: (e: MouseEvent) => void
	) {
		this.vaultNameEl = document.createElement('div');
		this.init(statusBar);
	}

	init(statusBar: Element | null): void {
		if (!statusBar) {
			console.warn('Status bar not found, vault name will not be displayed');
			return;
		}
		const settings = this.getSettings();
		if (settings.reducedAtStart) {
			const iconSpan = document.createElement('span');
			setIcon(iconSpan, 'chevrons-up-down');
			this.vaultNameEl.appendChild(iconSpan);
		} else {
			this.vaultNameEl.textContent = this.getTruncatedName(this.getVaultName());
		}
		this.vaultNameEl.classList.add("status-bar-vault-name");
		this.updateTooltip();
		statusBar.prepend(this.vaultNameEl);
		this.updateStyle();
		this.updateVisibility();

		// Register click events
		this.registerDomEvent(this.vaultNameEl, 'click', this.vaultsMenu);
		this.registerDomEvent(this.vaultNameEl, 'contextmenu', this.vaultsMenu);
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
		this.vaultNameEl.innerHTML = '';
		if (settings.reducedAtStart) {
			const iconSpan = document.createElement('span');
			setIcon(iconSpan, 'chevrons-up-down');
			this.vaultNameEl.appendChild(iconSpan);
		} else {
			this.vaultNameEl.textContent = this.getTruncatedName(this.getVaultName());
		}
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
