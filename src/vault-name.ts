import type { SBVNSettings } from "./interfaces.ts";
import { setIcon, type Plugin } from "obsidian";

/**
 * VaultName
 *
 * This class manages the display of the vault name in the status bar.
 * It handles the creation, updating, and removal of the vault name element.
 *
 * Features:
 * - Displays the vault name in the status bar
 * - Truncates the name if it exceeds the maximum length
 * - Applies color and font size settings
 * - Handles click and context menu events
 * - Supports reduced mode (showing only an icon)
 *
 * Methods:
 * - init(statusBar: Element | null): Initializes the vault name element
 * - getEl(): Returns the vault name element
 * - updateStyle(): Updates the color and font size of the vault name
 * - updateName(): Updates the displayed vault name
 * - updateTooltip(): Updates the tooltip for the vault name
 * - updateVisibility(): Updates the visibility based on settings
 * - getTruncatedName(name: string): Returns a truncated version of the name if needed
 */
export class VaultName {
	private vaultNameEl: HTMLDivElement;

	constructor(
		private getSettings: () => SBVNSettings,
		private getVaultName: () => string,
		statusBar: Element | null,
		private registerDomEvent: Plugin["registerDomEvent"],
		private vaultsMenu: (e: MouseEvent) => void,
	) {
		this.vaultNameEl = document.createElement("div");
		this.init(statusBar);
	}

	/**
	 * Initializes the vault name element in the status bar
	 */
	init(statusBar: Element | null): void {
		if (!statusBar) {
			console.warn(
				"Status bar not found, vault name will not be displayed",
			);
			return;
		}
		const settings = this.getSettings();
		if (settings.reducedAtStart) {
			const iconSpan = document.createElement("span");
			setIcon(iconSpan, "chevrons-up-down");
			this.vaultNameEl.appendChild(iconSpan);
		} else {
			this.vaultNameEl.textContent = this.getTruncatedName(
				this.getVaultName(),
			);
		}
		this.vaultNameEl.classList.add("status-bar-vault-name");
		this.updateTooltip();
		statusBar.prepend(this.vaultNameEl);
		this.updateStyle();
		this.updateVisibility();

		// Register click events
		this.registerDomEvent(this.vaultNameEl, "click", this.vaultsMenu);
		this.registerDomEvent(this.vaultNameEl, "contextmenu", this.vaultsMenu);
	}

	/**
	 * Returns the vault name element
	 */
	getEl(): HTMLDivElement {
		return this.vaultNameEl;
	}

	/**
	 * Updates the color and font size of the vault name
	 */
	updateStyle(): void {
		const settings = this.getSettings();
		this.vaultNameEl.style.color = settings.color;
		this.vaultNameEl.style.fontSize = `${settings.fontSize}em`;
	}

	/**
	 * Updates the displayed vault name (handles reduced mode)
	 */
	updateName(): void {
		const settings = this.getSettings();
		this.vaultNameEl.innerHTML = "";
		if (settings.reducedAtStart) {
			const iconSpan = document.createElement("span");
			setIcon(iconSpan, "chevrons-up-down");
			this.vaultNameEl.appendChild(iconSpan);
		} else {
			this.vaultNameEl.textContent = this.getTruncatedName(
				this.getVaultName(),
			);
		}
	}

	/**
	 * Updates the tooltip for the vault name
	 */
	updateTooltip(): void {
		this.vaultNameEl.setAttribute("aria-label", "vault name");
	}

	/**
	 * Updates the visibility based on settings
	 */
	updateVisibility(): void {
		const settings = this.getSettings();
		this.vaultNameEl.style.display = settings.enableVaultName
			? "flex"
			: "none";
	}

	/**
	 * Returns a truncated version of the name if it exceeds the maximum length
	 */
	getTruncatedName(name: string): string {
		const settings = this.getSettings();
		if (
			settings.enableMaxLength &&
			name.length > settings.maxVaultNameLength
		) {
			return name.slice(0, settings.maxVaultNameLength) + "...";
		}
		return name;
	}
}
