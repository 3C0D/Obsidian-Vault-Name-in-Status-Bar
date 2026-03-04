import { Plugin } from "obsidian";
import { Settings } from "./settings.ts";
import { vaultsMenu } from "./menu.ts";
import { chevronsVertical, chevronsHorizontal, lockOpen, lockClosed, DEFAULT_SETTINGS } from "./variables.ts";
import type { SBVNSettings } from "./interfaces.ts";

export default class StatusBarVaultName extends Plugin {
	settings: SBVNSettings;
	vaultNameEl: HTMLDivElement;
	lineWidthEl: HTMLDivElement;
	lineWidthStyleEl: HTMLStyleElement;
	sliderPopup: HTMLDivElement | null = null;
	leftGuide: HTMLDivElement | null = null;
	rightGuide: HTMLDivElement | null = null;
	guideTimeout: number = 0;
	debounceTimer: number = 0;
	boundClosePopup: (e: MouseEvent) => void;
	resizeObserver: ResizeObserver | null = null;

	get isLocked(): boolean {
		const path = this.getActiveFilePath();
		return path !== null && this.settings.localWidths[path] !== undefined;
	}

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new Settings(this.app, this));
		const vaultName = this.app.vault.getName();
		const statusBar = document.querySelector('.status-bar');

		this.vaultNameEl = document.createElement('div');
		this.vaultNameEl.innerHTML = this.settings.reducedAtStart ? `${chevronsVertical}` : `${chevronsVertical} ${this.getTruncatedVaultName(vaultName)}`;
		this.vaultNameEl.classList.add("status-bar-vault-name");
		this.updateVaultNameElTooltip();
		
		this.lineWidthEl = document.createElement('div');
		this.lineWidthEl.innerHTML = chevronsHorizontal;
		this.lineWidthEl.classList.add("status-bar-line-width");
		this.updateLineWidthTooltip();
		
		statusBar?.prepend(this.lineWidthEl);
		statusBar?.prepend(this.vaultNameEl);
		
		this.updateVaultNameElStyle();
		this.updateLineWidthElStyle();

		this.updateVaultNameVisibility();
		this.updateLineWidthVisibility();

		this.lineWidthStyleEl = document.createElement('style');
		document.head.appendChild(this.lineWidthStyleEl);
		this.applyLineWidth();

		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.updateEditorWidths();
				// Sync slider UI to active file's width when switching tabs
				this.syncSliderToActiveFile();
			})
		);

		this.vaultNameEl.addEventListener('click', (e) => vaultsMenu(this, this.app, e));

		this.lineWidthEl.addEventListener('click', (e) => {
			e.stopPropagation();
			this.toggleSliderPopup();
		});

		// Closes the popup when clicking outside of it (on the chevrons or the popup itself)
		this.boundClosePopup = (e: MouseEvent): void => {
			if (this.sliderPopup && !this.sliderPopup.contains(e.target as Node) && !this.lineWidthEl.contains(e.target as Node)) {
				this.hideSliderPopup();
			}
		};
		document.addEventListener('click', this.boundClosePopup);
	}

	onunload(): void {
		this.vaultNameEl.detach();
		this.lineWidthEl.detach();
		this.lineWidthStyleEl.remove();
		this.hideSliderPopup();
		this.hideWidthGuides();
		document.removeEventListener('click', this.boundClosePopup);
		if (this.guideTimeout) window.clearTimeout(this.guideTimeout);
		if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
		this.cleanupResizeObserver();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
		// Ensure localWidths exists even on old installs
		if (!this.settings.localWidths) this.settings.localWidths = {};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.updateVaultNameElStyle();
		this.updateVaultName();
		this.updateVaultNameElTooltip();
		this.updateVaultNameVisibility();
		
		this.updateLineWidthElStyle();
		this.updateLineWidthTooltip();
		this.updateLineWidthVisibility();
		this.applyLineWidth();
	}

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

	updateLineWidthElStyle(): void {
		this.lineWidthEl.style.color = this.settings.lineWidthColor;
	}

	updateLineWidthVisibility(): void {
		this.lineWidthEl.style.display = this.settings.enableLineWidth ? 'flex' : 'none';
	}

	updateLineWidthTooltip(): void {
		this.lineWidthEl.setAttribute('aria-label', `Editor width: ${this.settings.lineWidthPx}px`);
	}

	// Returns the active file path, or null if none
	getActiveFilePath(): string | null {
		const file = this.app.workspace.getActiveFile();
		return file ? file.path : null;
	}

	// Returns the width to display for the currently active file
	getActiveFileWidth(): number {
		const path = this.getActiveFilePath();
		if (path && this.settings.localWidths[path] !== undefined) {
			return this.settings.localWidths[path];
		}
		return this.settings.lineWidthPx;
	}

	// Syncs the slider and label in the popup to the active file's width
	syncSliderToActiveFile(): void {
		if (!this.sliderPopup) return;
		const width = this.getActiveFileWidth();
		const slider = this.sliderPopup.querySelector('input[type="range"]') as HTMLInputElement | null;
		const label = this.sliderPopup.querySelector('.line-width-slider-label') as HTMLElement | null;
		if (slider) slider.value = `${width}`;
		if (label) label.textContent = `${width}px`;

		// Refresh lock icon to reflect active file state
		const lockBtn = this.sliderPopup?.querySelector('.line-width-lock-btn') as HTMLElement | null;
		if (lockBtn) {
			if (this.isLocked) {
				lockBtn.innerHTML = lockClosed;
				lockBtn.style.color = 'var(--interactive-accent)';
			} else {
				lockBtn.innerHTML = lockOpen;
				lockBtn.style.color = 'var(--text-muted)';
			}
		}
	}

	applyLineWidth(): void {
		if (this.settings.enableLineWidth) {
			// CSS: reset Obsidian constraints + centering only (no width here, handled by JS)
			this.lineWidthStyleEl.textContent =
				// Reset Obsidian's default "Readable line length" constraints 
				// and other theme-specific width limits to ensure our custom width 
				// can be applied without being clipped.
				`.cm-contentContainer { max-width: unset !important; }` +
				`.cm-content { max-width: unset !important; }` +
				// Center the editor content horizontally when the custom width is active
				`.cm-sizer { margin-left: auto !important; margin-right: auto !important; }` +
				// Apply similar logic to Reading Mode and ensure box-sizing includes padding
				`.markdown-preview-view .markdown-preview-sizer { margin-left: auto !important; margin-right: auto !important; max-width: 100% !important; box-sizing: border-box !important; }` +
				// Prevent large diagrams (Mermaid) from breaking the layout
				`.markdown-preview-sizer .mermaid svg { max-width: 100% !important; height: auto !important; }`;
			// Listen for changes in the workspace size (like sidebars toggling) to adjust width
			this.setupResizeObserver();
			// Apply the current width settings immediately to all visible editor views
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

	// Recalculates editor widths whenever the workspace is resized (window resize, side panel toggle...)
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

	// Resolves the width to apply for a given leaf (local override or global)
	getWidthForLeaf(leaf: any): number {
		const file = leaf.view?.file;
		if (file && this.settings.localWidths[file.path] !== undefined) {
			return this.settings.localWidths[file.path];
		}
		return this.settings.lineWidthPx;
	}

	updateEditorWidths(): void {
		this.app.workspace.iterateAllLeaves(leaf => {
			const px = this.getWidthForLeaf(leaf);
			const containerEl = leaf.containerEl as HTMLElement;

			containerEl.querySelectorAll('.cm-editor').forEach(editorEl => {
				const sizerEl = editorEl.querySelector('.cm-sizer') as HTMLElement;
				if (!sizerEl) return;
				const width = (editorEl as HTMLElement).clientWidth;
				if (width <= 0) return;
				sizerEl.style.maxWidth = `${px}px`;
			});

			containerEl.querySelectorAll('.markdown-preview-view').forEach(previewEl => {
				const sizerEl = previewEl.querySelector('.markdown-preview-sizer') as HTMLElement;
				if (!sizerEl) return;
				const width = (previewEl as HTMLElement).clientWidth;
				if (width <= 0) return;
				sizerEl.style.maxWidth = `${px}px`;
				sizerEl.style.width = `${px}px`;
			});
		});
	}

	cleanupResizeObserver(): void {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
	}

	toggleSliderPopup(): void {
		if (this.sliderPopup) {
			this.hideSliderPopup();
		} else {
			this.showSliderPopup();
		}
	}

	showSliderPopup(): void {
		this.sliderPopup = document.createElement('div');
		this.sliderPopup.classList.add('line-width-slider-popup');

		// --- Header row: label + lock button ---
		const headerRow = document.createElement('div');
		headerRow.style.display = 'flex';
		headerRow.style.alignItems = 'center';
		headerRow.style.justifyContent = 'space-between';
		headerRow.style.width = '100%';

		const label = document.createElement('div');
		label.classList.add('line-width-slider-label');

		const lockBtn = document.createElement('button');
		lockBtn.classList.add('line-width-lock-btn');
		lockBtn.style.background = 'none';
		lockBtn.style.border = 'none';
		lockBtn.style.cursor = 'pointer';
		lockBtn.style.padding = '2px';
		lockBtn.style.display = 'flex';
		lockBtn.style.alignItems = 'center';
		lockBtn.style.color = 'var(--text-muted)';
		lockBtn.style.transition = 'color 0.2s';

		const updateLockState = (): void => {
			const width = this.getActiveFileWidth();
			label.textContent = `${width}px`;
			if (this.isLocked) {
				lockBtn.innerHTML = lockClosed;
				lockBtn.style.color = 'var(--interactive-accent)';
				lockBtn.setAttribute('aria-label', 'Local width (this file only)');
			} else {
				lockBtn.innerHTML = lockOpen;
				lockBtn.style.color = 'var(--text-muted)';
				lockBtn.setAttribute('aria-label', 'Global width (all files)');
			}
			slider.value = `${width}`;
		};

		lockBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const path = this.getActiveFilePath();
			if (!path) return;
			if (this.isLocked) {
				// Unlock: remove local override
				delete this.settings.localWidths[path];
				void this.saveData(this.settings);
				// Apply global width immediately to active leaf
				const activeLeaf = this.app.workspace.getMostRecentLeaf();
				if (activeLeaf) {
					const px = this.settings.lineWidthPx;
					const containerEl = activeLeaf.containerEl as HTMLElement;
					containerEl.querySelectorAll('.cm-sizer, .markdown-preview-sizer').forEach(el => {
						(el as HTMLElement).style.maxWidth = `${px}px`;
						(el as HTMLElement).style.width = `${px}px`;
					});
				}
			} else {
				// Lock: store current global width as local starting point
				this.settings.localWidths[path] = this.settings.lineWidthPx;
				void this.saveData(this.settings);
			}
			updateLockState();
		});

		headerRow.appendChild(label);
		headerRow.appendChild(lockBtn);

		// --- Slider ---
		const slider = document.createElement('input');
		slider.type = 'range';
		slider.min = '300';
		slider.max = '1600';
		slider.classList.add('line-width-slider');

		slider.addEventListener('input', async () => {
			const value = parseInt(slider.value);
			label.textContent = `${value}px`;

			if (this.isLocked) {
				// Local mode: store width for this file only
				const path = this.getActiveFilePath();
				if (path) {
					this.settings.localWidths[path] = value;
				}
				// Apply only to active leaf
				const activeLeaf = this.app.workspace.getMostRecentLeaf();
				if (activeLeaf) {
					const containerEl = activeLeaf.containerEl as HTMLElement;
					containerEl.querySelectorAll('.cm-sizer, .markdown-preview-sizer').forEach(el => {
						(el as HTMLElement).style.maxWidth = `${value}px`;
						(el as HTMLElement).style.width = `${value}px`;
					});
				}
				// Debounce save to avoid hammering disk while dragging
				if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
				this.debounceTimer = window.setTimeout(async () => {
					await this.saveData(this.settings);
				}, 500);
			} else {
				// Global mode: update all non-locked files
				this.settings.lineWidthPx = value;
				this.applyLineWidth();
				this.updateLineWidthTooltip();
				await this.saveData(this.settings);
			}

			// Restore focus to editor
			const recentLeaf = this.app.workspace.getMostRecentLeaf();
			if (recentLeaf) this.app.workspace.setActiveLeaf(recentLeaf, { focus: true });

			requestAnimationFrame(() => this.showWidthGuides());
			if (this.guideTimeout) window.clearTimeout(this.guideTimeout);
			this.guideTimeout = window.setTimeout(() => this.fadeOutWidthGuides(), 2000);
		});

		this.sliderPopup.appendChild(headerRow);
		this.sliderPopup.appendChild(slider);

		// Init state
		updateLockState();

		const rect = this.lineWidthEl.getBoundingClientRect();
		this.sliderPopup.style.position = 'fixed';
		this.sliderPopup.style.bottom = `${window.innerHeight - rect.top + 5}px`;
		this.sliderPopup.style.right = `${window.innerWidth - rect.right}px`;

		document.body.appendChild(this.sliderPopup);
	}

	hideSliderPopup(): void {
		if (this.sliderPopup) {
			this.sliderPopup.remove();
			this.sliderPopup = null;
		}
	}

	showWidthGuides(): void {
		this.hideWidthGuides();

		const activeLeaf = document.querySelector('.workspace-leaf.mod-active');
		if (!activeLeaf) return;

		// Reading mode
		const readingContainer = activeLeaf.querySelector('.markdown-reading-view') as HTMLElement | null;
	
		// Ensure the container is visible to not enter this condition if not in reading mode and cause a bug
		if (readingContainer && readingContainer.offsetParent !== null) {
			const sizerEl = readingContainer.querySelector('.markdown-preview-sizer') as HTMLElement;
			if (!sizerEl) return;
			const containerRect = readingContainer.getBoundingClientRect();
			const contentWidth = this.getActiveFileWidth();
			const offsetX = Math.max(0, (containerRect.width - contentWidth) / 2);

			this.leftGuide = document.createElement('div');
			this.leftGuide.classList.add('line-width-guide');
			this.leftGuide.style.left = `${containerRect.left + offsetX}px`;

			this.rightGuide = document.createElement('div');
			this.rightGuide.classList.add('line-width-guide');
			this.rightGuide.style.left = `${containerRect.left + offsetX + contentWidth}px`;

			document.body.appendChild(this.leftGuide);
			document.body.appendChild(this.rightGuide);
			return;
		}

		// Live preview / source mode
		const contentEl = activeLeaf.querySelector('.cm-sizer') as HTMLElement | null;
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
