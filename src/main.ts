import { Plugin, WorkspaceLeaf, debounce } from "obsidian";
import { Settings } from "./settings.ts";
import { vaultsMenu } from "./menu.ts";
import { chevronsHorizontal, lockBadge, DEFAULT_SETTINGS } from "./variables.ts";
import type { SBVNSettings } from "./interfaces.ts";
import { WidthGuides } from "./guides.ts";
import { getLeafId, getFilePathForLeaf, getWidthForLeafPath, isFileLocked, getTooltipForLeaf } from "./leaf-utils.ts";
import { WidthManager } from "./width-manager.ts";
import { VaultName } from "./vault-name.ts";
import { PopupManager } from "./popup-manager.ts";

export default class StatusBarVaultName extends Plugin {
	settings: SBVNSettings;
	vaultName: VaultName;
	lineWidthStyleEl: HTMLStyleElement;
	guides: WidthGuides;
	widthManager: WidthManager;
	popupManager: PopupManager;
	saveDebounced = debounce(async () => {
		await this.saveData(this.settings);
	}, 500, true);

	// Tracks injected icons: one per leaf (keyed by leaf id)
	leafIcons: Map<string, HTMLDivElement> = new Map();
	// Tracks documents that already have click listeners registered
	registeredDocs: Set<Document> = new Set();

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new Settings(this.app, this));
		const statusBar = document.querySelector('.status-bar');

		// Initialize VaultName
		this.vaultName = new VaultName(
			() => this.settings,
			() => this.app.vault.getName()
		);
		this.vaultName.init(statusBar);

		// Register click event on vault name element
		this.registerDomEvent(this.vaultName.getEl(), 'click', (e) => vaultsMenu(this, this.app, e));
		this.registerDomEvent(this.vaultName.getEl(), 'contextmenu', (e) => vaultsMenu(this, this.app, e));

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

		// Initialize PopupManager
		this.popupManager = new PopupManager(
			() => this.settings,
			(data) => this.saveData(data),
			this.saveDebounced,
			this.widthManager,
			this.guides,
			(leaf) => this.refreshLeafIcon(leaf),
			(leaf, opts) => this.app.workspace.setActiveLeaf(leaf, opts)
		);

		// Inject icons into all existing leaves, then watch for new ones
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.widthManager.updateEditorWidths();
				this.injectAllLeafIcons();
			})
		);

		// Close any popup when clicking outside (main document)
		this.registerDomEvent(document, 'click', (e) => this.popupManager.onDocumentClick(e, this.leafIcons));

		// Initial injection
		this.app.workspace.onLayoutReady(() => {
			this.injectAllLeafIcons();
		});
	}

	onunload(): void {
		this.vaultName.getEl().detach();
		this.lineWidthStyleEl.remove();
		// Remove all injected icons
		this.leafIcons.forEach(el => el.remove());
		this.leafIcons.clear();
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
		this.injectAllLeafIcons();
		this.updateAllLeafIconColors();
	}

	updateAllLeafIconColors(): void {
		this.leafIcons.forEach(iconEl => {
			iconEl.style.color = this.settings.lineWidthColor;
		});
	}

	// ---------------------------- Per-leaf icon injection -------------------

	// Injects the line width icon into all Markdown leaves that don't have one yet
	injectAllLeafIcons(): void {
		this.app.workspace.iterateAllLeaves(leaf => {
			const viewType = leaf.view?.getViewType();
			if (viewType !== 'markdown') return;

			const leafId = getLeafId(leaf);
			if (!leafId) return;

			// Check if icon already injected and still in DOM
			const existing = this.leafIcons.get(leafId);
			if (existing && existing.isConnected) {
				// Just refresh its state
				existing.style.display = this.settings.enableLineWidth ? 'flex' : 'none';
				this.refreshLeafIcon(leaf);
				return;
			}

			// actionsEl is the right-side button area in the leaf header
			const actionsEl = (leaf.view as any).actionsEl as HTMLElement | undefined;
			if (!actionsEl) return;

			// Register click listener on this document if not already done
			const ownerDoc = actionsEl.ownerDocument;
			if (!this.registeredDocs.has(ownerDoc)) {
				this.registeredDocs.add(ownerDoc);
				this.registerDomEvent(ownerDoc, 'click', (e) => this.popupManager.onDocumentClick(e, this.leafIcons));
			}

			const iconEl = ownerDoc.createElement('div');
			iconEl.classList.add('lw-leaf-icon');
			iconEl.innerHTML = `<span class="lw-icon">${chevronsHorizontal}</span>`;
			iconEl.setAttribute('aria-label', getTooltipForLeaf(leaf, this.settings));

			// Insert before the first existing action button
			actionsEl.prepend(iconEl);
			this.leafIcons.set(leafId, iconEl);

			// Apply current settings
			iconEl.style.color = this.settings.lineWidthColor;
			iconEl.style.display = this.settings.enableLineWidth ? 'flex' : 'none';

			this.refreshLeafIcon(leaf);

			iconEl.addEventListener('click', (e) => {
				e.stopPropagation();
				this.popupManager.togglePopupForLeaf(leaf, iconEl);
			});
		});

		// Clean up icons for leaves that no longer exist
		const activeLeafIds = new Set<string>();
		this.app.workspace.iterateAllLeaves(leaf => {
			activeLeafIds.add(getLeafId(leaf));
		});
		this.leafIcons.forEach((el, id) => {
			if (!activeLeafIds.has(id)) {
				el.remove();
				this.leafIcons.delete(id);
				const popups = this.popupManager.getActivePopups();
				const popup = popups.get(id);
				if (popup) { popup.remove(); popups.delete(id); }
			}
		});
	}

	// Updates the badge and tooltip on the icon for a given leaf
	refreshLeafIcon(leaf: WorkspaceLeaf): void {
		const leafId = getLeafId(leaf);
		const iconEl = this.leafIcons.get(leafId);
		if (!iconEl) return;

		const filePath = getFilePathForLeaf(leaf);
		const locked = isFileLocked(filePath, this.settings);

		const existingBadge = iconEl.querySelector('.lw-lock-badge');
		if (locked && !existingBadge) {
			const b = iconEl.ownerDocument.createElement('span');
			b.classList.add('lw-lock-badge');
			b.innerHTML = lockBadge;
			iconEl.appendChild(b);
		} else if (!locked && existingBadge) {
			existingBadge.remove();
		}

		iconEl.setAttribute('aria-label', getTooltipForLeaf(leaf, this.settings));
	}
}

