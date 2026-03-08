import { Plugin, debounce } from "obsidian";
import { Settings } from "./settings.ts";
import { vaultsMenu } from "./menu.ts";
import { DEFAULT_SETTINGS } from "./variables.ts";
import type { SBVNSettings } from "./interfaces.ts";
import { WidthGuides } from "./guides.ts";
import { getFilePathForLeaf, getWidthForLeafPath } from "./leaf-utils.ts";
import { WidthManager } from "./width-manager.ts";
import { VaultName } from "./vault-name.ts";
import { PopupManager } from "./popup-manager.ts";
import { LeafIconManager } from "./leaf-icon-manager.ts";

export default class StatusBarVaultName extends Plugin {
	settings: SBVNSettings;
	vaultName: VaultName;
	lineWidthStyleEl: HTMLStyleElement;
	guides: WidthGuides;
	widthManager: WidthManager;
	popupManager: PopupManager;
	leafIconManager: LeafIconManager;
	saveDebounced = debounce(async () => {
		await this.saveData(this.settings);
	}, 500, false);

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new Settings(this.app, this));
		const statusBar = this.app.statusBar.containerEl;

		// Initialize VaultName
		this.vaultName = new VaultName(
			() => this.settings,
			() => this.app.vault.getName(),
			statusBar,
			this.registerDomEvent.bind(this),
			(e) => vaultsMenu(this, this.app, e)
		);

		// Global CSS style element
		this.lineWidthStyleEl = document.createElement('style');
		document.head.appendChild(this.lineWidthStyleEl);

		// Initialize WidthManager
		this.widthManager = new WidthManager(
			() => this.settings,
			this.lineWidthStyleEl,
			(cb) => this.app.workspace.iterateAllLeaves(cb)
		);
		this.widthManager.applyLineWidth();

		// Initialize width guides
		this.guides = new WidthGuides(
			(filePath) => getWidthForLeafPath(filePath, this.settings),
			(leaf) => getFilePathForLeaf(leaf)
		);

		// Initialize LeafIconManager first (needed by PopupManager)
		this.leafIconManager = new LeafIconManager(
			() => this.settings,
			(cb) => this.app.workspace.iterateAllLeaves(cb),
			this.registerDomEvent.bind(this)
		);

		// Initialize PopupManager
		this.popupManager = new PopupManager(
			this.app,
			() => this.settings,
			(data) => this.saveData(data),
			this.saveDebounced,
			this.widthManager,
			this.guides,
			(leaf) => this.leafIconManager.refresh(leaf),
			(leaf, opts) => this.app.workspace.setActiveLeaf(leaf, opts)
		);

		// Link PopupManager to LeafIconManager
		this.leafIconManager.setPopupManager(this.popupManager);

		// Inject icons into all existing leaves, then watch for new ones
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.widthManager.updateEditorWidths();
				this.leafIconManager.injectAll();
			})
		);

		// Close any popup when clicking outside (main document)
		this.registerDomEvent(document, 'click', (e) => this.popupManager.onDocumentClick(e, this.leafIconManager.getLeafIcons()));

		// Initial injection
		this.app.workspace.onLayoutReady(() => {
			this.leafIconManager.injectAll();
		});
	}

	onunload(): void {
		this.vaultName.getEl().detach();
		this.lineWidthStyleEl.remove();
		// Remove all injected icons
		this.leafIconManager.cleanup();
		// Close all popups
		this.popupManager.cleanup();
		this.guides.cleanup();
		this.widthManager.cleanupResizeObserver();
	}

	async loadSettings(): Promise<void> {
		this.settings = {
			...DEFAULT_SETTINGS,
			...await this.loadData()
		};
		// compatibility fix
		if (!this.settings.localWidths) this.settings.localWidths = {};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.vaultName.updateStyle();
		this.vaultName.updateName();
		this.vaultName.updateTooltip();
		this.vaultName.updateVisibility();
		this.widthManager.applyLineWidth();
		this.leafIconManager.refreshAll();
	}
}
