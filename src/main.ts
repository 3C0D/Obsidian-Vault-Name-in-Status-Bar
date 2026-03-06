import { MarkdownView, Plugin, WorkspaceLeaf, debounce } from "obsidian";
import { Settings } from "./settings.ts";
import { vaultsMenu } from "./menu.ts";
import { chevronsHorizontal, lockOpen, lockClosed, lockBadge, DEFAULT_SETTINGS } from "./variables.ts";
import type { SBVNSettings } from "./interfaces.ts";
import { WidthGuides } from "./guides.ts";
import { getLeafId, getFilePathForLeaf, getWidthForLeafPath, isFileLocked, getTooltipForLeaf } from "./leaf-utils.ts";
import { WidthManager } from "./width-manager.ts";
import { VaultName } from "./vault-name.ts";

export default class StatusBarVaultName extends Plugin {
	settings: SBVNSettings;
	vaultName: VaultName;
	lineWidthStyleEl: HTMLStyleElement;
	savedCursor: { from: { ch: number; line: number }; to: { ch: number; line: number } } | null = null;
	savedCursorLeaf: WorkspaceLeaf | null = null;
	guides: WidthGuides;
	widthManager: WidthManager;
	saveDebounced = debounce(async () => {
		await this.saveData(this.settings);
	}, 500, true);

	// Tracks open popups: one per leaf (keyed by leaf id)
	activePopups: Map<string, HTMLDivElement> = new Map();
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

		// Inject icons into all existing leaves, then watch for new ones
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.widthManager.updateEditorWidths();
				this.injectAllLeafIcons();
			})
		);

		// Close any popup when clicking outside (main document)
		this.registerDomEvent(document, 'click', this.onDocumentClick.bind(this));

		// Initial injection
		this.app.workspace.onLayoutReady(() => {
			this.injectAllLeafIcons();
		});

		// Initialize width guides
		this.guides = new WidthGuides(
			(filePath) => getWidthForLeafPath(filePath, this.settings),
			(leaf) => getFilePathForLeaf(leaf)
		);
	}

	onunload(): void {
		this.vaultName.getEl().detach();
		this.lineWidthStyleEl.remove();
		// Remove all injected icons
		this.leafIcons.forEach(el => el.remove());
		this.leafIcons.clear();
		// Close all popups
		this.activePopups.forEach(popup => popup.remove());
		this.activePopups.clear();
		this.guides.cleanup();
		this.widthManager.cleanupResizeObserver();
	}

	// Closes popups when clicking outside of them or their associated icons
	onDocumentClick(e: MouseEvent): void {
		this.activePopups.forEach((popup, leafId) => {
			const icon = this.leafIcons.get(leafId);
			// If the click is outside the popup and its associated icon, close the popup
			if (
				!popup.contains(e.target as Node) &&
				!(icon && icon.contains(e.target as Node))
			) {
				popup.remove();
				this.activePopups.delete(leafId);
				// Restore cursor only if click is from the same document as the saved leaf
				const clickDoc = (e.target as Node).ownerDocument;
				const leafDoc = this.savedCursorLeaf?.containerEl.ownerDocument;
				if (clickDoc === leafDoc) {
					this.restoreCursor();
				}
			}
		});
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
				this.registerDomEvent(ownerDoc, 'click', this.onDocumentClick.bind(this));
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
				this.togglePopupForLeaf(leaf, iconEl);
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
				const popup = this.activePopups.get(id);
				if (popup) { popup.remove(); this.activePopups.delete(id); }
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

	// ---------------------------- Popup per leaf ----------------------------

	restoreCursor(): void {
		if (!this.settings.restoreCursorOnClose) return;
		if (this.savedCursor && this.savedCursorLeaf) {
			this.app.workspace.setActiveLeaf(this.savedCursorLeaf, { focus: true });
			const view = this.savedCursorLeaf.view instanceof MarkdownView ? this.savedCursorLeaf.view : null;
			view?.editor?.setSelection(this.savedCursor.from, this.savedCursor.to);
			this.savedCursor = null;
			this.savedCursorLeaf = null;
		}
	}

	togglePopupForLeaf(leaf: WorkspaceLeaf, iconEl: HTMLDivElement): void {
		const leafId = getLeafId(leaf);
		const existing = this.activePopups.get(leafId);
		if (existing) {
			existing.remove();
			this.activePopups.delete(leafId);
			this.restoreCursor();
		} else {
			this.showPopupForLeaf(leaf, iconEl);
		}
	}

	showPopupForLeaf(leaf: WorkspaceLeaf, iconEl: HTMLDivElement): void {
		const leafId = getLeafId(leaf);

		// Save cursor position
		const view = leaf.view instanceof MarkdownView ? leaf.view : null;
		const editor = view?.editor;
		if (editor) {
			this.savedCursor = {
				from: editor.getCursor("anchor"),
				to: editor.getCursor("head")
			};
			this.savedCursorLeaf = leaf;
		}

		// Close any other open popup
		this.activePopups.forEach((popup, id) => {
			if (id !== leafId) { popup.remove(); this.activePopups.delete(id); }
		});

		const filePath = getFilePathForLeaf(leaf);

		const popup = document.createElement('div');
		popup.classList.add('line-width-slider-popup');

		// Header row
		const headerRow = document.createElement('div');
		headerRow.classList.add('line-width-slider-header');

		const label = document.createElement('div');
		label.classList.add('line-width-slider-label');

		const lockBtn = document.createElement('button');
		lockBtn.classList.add('line-width-lock-btn');

		const slider = document.createElement('input');
		slider.type = 'range';
		slider.min = '300';
		slider.max = '1600';
		slider.classList.add('line-width-slider');

		// Updates the popup UI to reflect the current lock state (local vs global width)
		const updateLockState = (): void => {
			const width = getWidthForLeafPath(filePath, this.settings);
			label.textContent = `${width}px`;
			slider.value = `${width}`;
			if (isFileLocked(filePath, this.settings)) {
				lockBtn.innerHTML = lockClosed;
				lockBtn.style.color = 'var(--interactive-accent)';
				lockBtn.setAttribute('aria-label', 'Local width (this file only)');
			} else {
				lockBtn.innerHTML = lockOpen;
				lockBtn.style.color = 'var(--text-muted)';
				lockBtn.setAttribute('aria-label', 'Global width (all files)');
			}
			this.refreshLeafIcon(leaf);
		};

		// When lock button is clicked, toggle between local and global width for this file
		lockBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			if (!filePath) return;
			if (isFileLocked(filePath, this.settings)) {
				// Unlock: remove local override, apply global width immediately
				delete this.settings.localWidths[filePath];
				void this.saveData(this.settings);
				this.widthManager.applyWidthToLeaf(leaf, this.settings.lineWidthPx);
			} else {
				// Lock: store current global width as local starting point
				this.settings.localWidths[filePath] = this.settings.lineWidthPx;
				void this.saveData(this.settings);
			}
			updateLockState();
		});

		// When slider changes, update widths based on lock state
		slider.addEventListener('input', () => {
			const value = parseInt(slider.value);
			label.textContent = `${value}px`;

			if (isFileLocked(filePath, this.settings)) {
				// Local mode: apply only to this leaf
				if (filePath) this.settings.localWidths[filePath] = value;
				this.widthManager.applyWidthToLeaf(leaf, value);
			} else {
				// Global mode: apply to all non-locked leaves
				this.settings.lineWidthPx = value;
				this.widthManager.applyLineWidth();
			}
			this.saveDebounced();

			this.refreshLeafIcon(leaf);

			requestAnimationFrame(() => this.guides.showWidthGuidesForLeaf(leaf));
			this.guides.scheduleHide(2000);
		});

		headerRow.appendChild(label);
		headerRow.appendChild(lockBtn);
		popup.appendChild(headerRow);
		popup.appendChild(slider);

		updateLockState();

		// Position: below the icon, right-aligned on icon's right edge
		const rect = iconEl.getBoundingClientRect();
		const ownerDoc = iconEl.ownerDocument;
		const ownerWin = ownerDoc.defaultView!;
		popup.style.position = 'fixed';
		popup.style.top = `${rect.bottom + 5}px`;
		popup.style.right = `${ownerWin.innerWidth - rect.right}px`;

		ownerDoc.body.appendChild(popup);
		this.activePopups.set(leafId, popup);
	}
}
