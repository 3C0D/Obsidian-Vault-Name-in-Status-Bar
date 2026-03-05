import { Plugin, WorkspaceLeaf } from "obsidian";
import { Settings } from "./settings.ts";
import { vaultsMenu } from "./menu.ts";
import { chevronsVertical, chevronsHorizontal, lockOpen, lockClosed, lockBadge, DEFAULT_SETTINGS } from "./variables.ts";
import type { SBVNSettings } from "./interfaces.ts";

export default class StatusBarVaultName extends Plugin {
	settings: SBVNSettings;
	vaultNameEl: HTMLDivElement;
	lineWidthStyleEl: HTMLStyleElement;
	leftGuide: HTMLDivElement | null = null;
	rightGuide: HTMLDivElement | null = null;
	guideTimeout: number = 0;
	debounceTimer: number = 0;
	resizeObserver: ResizeObserver | null = null;

	// Tracks open popups: one per leaf (keyed by leaf id)
	activePopups: Map<string, HTMLDivElement> = new Map();
	// Tracks injected icons: one per leaf (keyed by leaf id)
	leafIcons: Map<string, HTMLDivElement> = new Map();
	// Tracks documents that already have click listeners registered
	registeredDocs: Set<Document> = new Set();

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new Settings(this.app, this));
		const vaultName = this.app.vault.getName();
		const statusBar = document.querySelector('.status-bar');

		// Vault name
		this.vaultNameEl = document.createElement('div');
		this.vaultNameEl.innerHTML = this.settings.reducedAtStart ? `${chevronsVertical}` : `${chevronsVertical} ${this.getTruncatedVaultName(vaultName)}`;
		this.vaultNameEl.classList.add("status-bar-vault-name");
		this.updateVaultNameElTooltip();
		statusBar?.prepend(this.vaultNameEl);
		this.updateVaultNameElStyle();
		this.updateVaultNameVisibility();

		// Global CSS style element
		this.lineWidthStyleEl = document.createElement('style');
		document.head.appendChild(this.lineWidthStyleEl);
		this.applyLineWidth();

		this.registerDomEvent(this.vaultNameEl, 'click', (e) => vaultsMenu(this, this.app, e));

		// Inject icons into all existing leaves, then watch for new ones
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.updateEditorWidths();
				this.injectAllLeafIcons();
			})
		);

		// Close any popup when clicking outside (main document)
		this.registerDomEvent(document, 'click', this.onDocumentClick.bind(this));

		// Initial injection
		this.app.workspace.onLayoutReady(() => {
			this.injectAllLeafIcons();
		});
	}

	onunload(): void {
		this.vaultNameEl.detach();
		this.lineWidthStyleEl.remove();
		// Remove all injected icons
		this.leafIcons.forEach(el => el.remove());
		this.leafIcons.clear();
		// Close all popups
		this.activePopups.forEach(popup => popup.remove());
		this.activePopups.clear();
		this.hideWidthGuides();

		if (this.guideTimeout) window.clearTimeout(this.guideTimeout);
		if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
		this.cleanupResizeObserver();
	}

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
		this.updateVaultNameElStyle();
		this.updateVaultName();
		this.updateVaultNameElTooltip();
		this.updateVaultNameVisibility();
		this.applyLineWidth();
		this.injectAllLeafIcons();
		this.updateAllLeafIconColors();
	}

	// ---------------------------- Vault name --------------------------------

	updateVaultNameElStyle(): void {
		this.vaultNameEl.style.color = this.settings.color;
		this.vaultNameEl.style.fontSize = `${this.settings.fontSize}em`;
	}

	updateVaultName(): void {
		const vaultName = this.app.vault.getName();
		this.vaultNameEl.innerHTML = this.settings.reducedAtStart ? `${chevronsVertical}` : `${chevronsVertical} ${this.getTruncatedVaultName(vaultName)}`;
	}

	updateVaultNameElTooltip(): void {
		this.vaultNameEl.setAttribute('aria-label', "vault name");
	}

	updateVaultNameVisibility(): void {
		this.vaultNameEl.style.display = this.settings.enableVaultName ? 'flex' : 'none';
	}

	getTruncatedVaultName(name: string): string {
		if (this.settings.enableMaxLength && name.length > this.settings.maxVaultNameLength) {
			return name.slice(0, this.settings.maxVaultNameLength) + '...';
		}
		return name;
	}

	updateAllLeafIconColors(): void {
		this.leafIcons.forEach(iconEl => {
			iconEl.style.color = this.settings.lineWidthColor;
		});
	}

	// ---------------------------- Per-leaf icon injection -------------------

	// Returns a stable id for a leaf
	getLeafId(leaf: WorkspaceLeaf): string {
		return (leaf as any).id ?? '';
	}

	// Injects the line width icon into all Markdown leaves that don't have one yet
	injectAllLeafIcons(): void {
		this.app.workspace.iterateAllLeaves(leaf => {
			const viewType = leaf.view?.getViewType();
			if (viewType !== 'markdown') return;

			const leafId = this.getLeafId(leaf);
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
			iconEl.setAttribute('aria-label', this.getTooltipForLeaf(leaf));

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
			activeLeafIds.add(this.getLeafId(leaf));
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
		const leafId = this.getLeafId(leaf);
		const iconEl = this.leafIcons.get(leafId);
		if (!iconEl) return;

		const filePath = this.getFilePathForLeaf(leaf);
		const locked = this.isFileLocked(filePath);

		const existingBadge = iconEl.querySelector('.lw-lock-badge');
		if (locked && !existingBadge) {
			const b = iconEl.ownerDocument.createElement('span');
			b.classList.add('lw-lock-badge');
			b.innerHTML = lockBadge;
			iconEl.appendChild(b);
		} else if (!locked && existingBadge) {
			existingBadge.remove();
		}

		iconEl.setAttribute('aria-label', this.getTooltipForLeaf(leaf));
	}

	getFilePathForLeaf(leaf: WorkspaceLeaf): string | null {
		return (leaf.view as any)?.file?.path ?? null;
	}

	getWidthForLeafPath(filePath: string | null): number {
		if (filePath && this.settings.localWidths[filePath] !== undefined) {
			return this.settings.localWidths[filePath];
		}
		return this.settings.lineWidthPx;
	}

	// Checks if a file has a local width override (locked state)
	isFileLocked(filePath: string | null): boolean {
		return filePath !== null && this.settings.localWidths[filePath] !== undefined;
	}

	getTooltipForLeaf(leaf: WorkspaceLeaf): string {
		const filePath = this.getFilePathForLeaf(leaf);
		const width = this.getWidthForLeafPath(filePath);
		const locked = this.isFileLocked(filePath);
		return `Editor width: ${width}px${locked ? ' (local)' : ' (global)'}`;
	}

	// ---------------------------- Popup per leaf ----------------------------

	togglePopupForLeaf(leaf: WorkspaceLeaf, iconEl: HTMLDivElement): void {
		const leafId = this.getLeafId(leaf);
		const existing = this.activePopups.get(leafId);
		if (existing) {
			existing.remove();
			this.activePopups.delete(leafId);
		} else {
			this.showPopupForLeaf(leaf, iconEl);
		}
	}

	showPopupForLeaf(leaf: WorkspaceLeaf, iconEl: HTMLDivElement): void {
		const leafId = this.getLeafId(leaf);

		// Close any other open popup
		this.activePopups.forEach((popup, id) => {
			if (id !== leafId) { popup.remove(); this.activePopups.delete(id); }
		});

		const filePath = this.getFilePathForLeaf(leaf);

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
			const width = this.getWidthForLeafPath(filePath);
			label.textContent = `${width}px`;
			slider.value = `${width}`;
			if (this.isFileLocked(filePath)) {
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
			if (this.isFileLocked(filePath)) {
				// Unlock: remove local override, apply global width immediately
				delete this.settings.localWidths[filePath];
				void this.saveData(this.settings);
				this.applyWidthToLeaf(leaf, this.settings.lineWidthPx);
			} else {
				// Lock: store current global width as local starting point
				this.settings.localWidths[filePath] = this.settings.lineWidthPx;
				void this.saveData(this.settings);
			}
			updateLockState();
		});

		// When slider changes, update widths based on lock state
		slider.addEventListener('input', async () => {
			const value = parseInt(slider.value);
			label.textContent = `${value}px`;

			if (this.isFileLocked(filePath)) {
				// Local mode: apply only to this leaf
				if (filePath) this.settings.localWidths[filePath] = value;
				this.applyWidthToLeaf(leaf, value);
				if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
				this.debounceTimer = window.setTimeout(async () => {
					await this.saveData(this.settings);
				}, 500);
			} else {
				// Global mode: apply to all non-locked leaves
				this.settings.lineWidthPx = value;
				this.applyLineWidth();
				await this.saveData(this.settings);
			}

			this.refreshLeafIcon(leaf);

			// Restore focus
			this.app.workspace.setActiveLeaf(leaf, { focus: true });

			requestAnimationFrame(() => this.showWidthGuidesForLeaf(leaf));
			if (this.guideTimeout) window.clearTimeout(this.guideTimeout);
			this.guideTimeout = window.setTimeout(() => this.fadeOutWidthGuides(), 2000);
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

	// Applies a width directly to a specific leaf's DOM elements
	applyWidthToLeaf(leaf: WorkspaceLeaf, px: number): void {
		const containerEl = leaf.containerEl as HTMLElement;
		containerEl.querySelectorAll('.cm-sizer').forEach(el => {
			(el as HTMLElement).style.maxWidth = `${px}px`;
		});
		containerEl.querySelectorAll('.markdown-preview-sizer').forEach(el => {
			(el as HTMLElement).style.maxWidth = `${px}px`;
			(el as HTMLElement).style.width = `${px}px`;
		});
	}

	// ---------------------------- CSS / widths ------------------------------

	applyLineWidth(): void {
		if (this.settings.enableLineWidth) {
			this.lineWidthStyleEl.textContent =
				`.cm-contentContainer { max-width: unset !important; }` +
				`.cm-content { max-width: unset !important; }` +
				`.cm-sizer { margin-left: auto !important; margin-right: auto !important; }` +
				`.markdown-preview-view .markdown-preview-sizer { margin-left: auto !important; margin-right: auto !important; max-width: 100% !important; box-sizing: border-box !important; }` +
				`.markdown-preview-sizer .mermaid svg { max-width: 100% !important; height: auto !important; }`;
			this.setupResizeObserver();
			this.updateEditorWidths();
		} else {
			this.lineWidthStyleEl.textContent = '';
			this.cleanupResizeObserver();
			this.getAllDocuments().forEach(doc => {
				doc.querySelectorAll('.cm-sizer, .markdown-preview-sizer').forEach(el => {
					(el as HTMLElement).style.removeProperty('max-width');
					(el as HTMLElement).style.removeProperty('width');
				});
			});
		}
	}

	setupResizeObserver(): void {
		this.cleanupResizeObserver();
		this.resizeObserver = new ResizeObserver(() => this.updateEditorWidths());
		const workspaceEl = document.querySelector('.workspace');
		if (workspaceEl) this.resizeObserver.observe(workspaceEl);
	}

	getAllDocuments(): Document[] {
		const docs = new Set<Document>();
		docs.add(document);
		this.app.workspace.iterateAllLeaves(leaf => {
			docs.add(leaf.containerEl.ownerDocument);
		});
		return Array.from(docs);
	}

	updateEditorWidths(): void {
		this.app.workspace.iterateAllLeaves(leaf => {
			const filePath = this.getFilePathForLeaf(leaf);
			const px = this.getWidthForLeafPath(filePath);
			this.applyWidthToLeaf(leaf, px);
		});
	}

	cleanupResizeObserver(): void {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
	}

	// ---------------------------- Width guides ------------------------------

	showWidthGuidesForLeaf(leaf: WorkspaceLeaf): void {
		this.hideWidthGuides();

		const ownerDoc = leaf.containerEl.ownerDocument;
		if (ownerDoc !== document) return;

		const filePath = this.getFilePathForLeaf(leaf);
		const px = this.getWidthForLeafPath(filePath);
		const containerEl = leaf.containerEl as HTMLElement;

		// Reading mode
		const readingContainer = containerEl.querySelector('.markdown-reading-view') as HTMLElement | null;
		if (readingContainer && readingContainer.offsetParent !== null) {
			const containerRect = readingContainer.getBoundingClientRect();
			const offsetX = Math.max(0, (containerRect.width - px) / 2);

			this.leftGuide = document.createElement('div');
			this.leftGuide.classList.add('line-width-guide');
			this.leftGuide.style.left = `${containerRect.left + offsetX}px`;

			this.rightGuide = document.createElement('div');
			this.rightGuide.classList.add('line-width-guide');
			this.rightGuide.style.left = `${containerRect.left + offsetX + px}px`;

			document.body.appendChild(this.leftGuide);
			document.body.appendChild(this.rightGuide);
			return;
		}

		// Live preview / source mode
		const contentEl = containerEl.querySelector('.cm-sizer') as HTMLElement | null;
		if (!contentEl) return;

		const rect = contentEl.getBoundingClientRect();
		if (rect.width <= 0) return;

		this.leftGuide = document.createElement('div');
		this.leftGuide.classList.add('line-width-guide');
		this.leftGuide.style.left = `${rect.left}px`;

		this.rightGuide = document.createElement('div');
		this.rightGuide.classList.add('line-width-guide');
		this.rightGuide.style.left = `${rect.right}px`;

		document.body.appendChild(this.leftGuide);
		document.body.appendChild(this.rightGuide);
	}

	hideWidthGuides(): void {
		this.leftGuide?.remove();
		this.rightGuide?.remove();
		this.leftGuide = null;
		this.rightGuide = null;
	}

	fadeOutWidthGuides(): void {
		if (this.leftGuide) this.leftGuide.classList.add('line-width-guide-fade');
		if (this.rightGuide) this.rightGuide.classList.add('line-width-guide-fade');
		window.setTimeout(() => this.hideWidthGuides(), 500);
	}
}
