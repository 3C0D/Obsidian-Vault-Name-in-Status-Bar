import { MarkdownView, Plugin } from "obsidian";
import { Settings } from "./settings.ts";
import { vaultsMenu } from "./menu.ts";
import { chevronsVertical, chevronsHorizontal, DEFAULT_SETTINGS } from "./variables.ts";
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
	boundClosePopup: (e: MouseEvent) => void;
	resizeObserver: ResizeObserver | null = null;

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
			this.app.workspace.on('layout-change', () => this.updateEditorWidths())
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
		this.cleanupResizeObserver();
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
			document.querySelectorAll('.cm-sizer, .markdown-preview-sizer').forEach(el => {
				(el as HTMLElement).style.removeProperty('max-width');
				(el as HTMLElement).style.removeProperty('width');
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

	updateEditorWidths(): void {
		const px = this.settings.lineWidthPx;

		// Live preview / source mode — base width from .cm-editor (ignores readable line width)
		document.querySelectorAll('.cm-editor').forEach(editorEl => {
			const sizerEl = editorEl.querySelector('.cm-sizer') as HTMLElement;
			if (!sizerEl) return;
			const width = (editorEl as HTMLElement).clientWidth;
			if (width <= 0) return;
			sizerEl.style.maxWidth = `${px}px`;
		});

		// Reading mode
		document.querySelectorAll('.markdown-preview-view').forEach(previewEl => {
			const sizerEl = previewEl.querySelector('.markdown-preview-sizer') as HTMLElement;
			if (!sizerEl) return;
			const width = (previewEl as HTMLElement).clientWidth;
			if (width <= 0) return;
			sizerEl.style.maxWidth = `${px}px`;
			sizerEl.style.width = `${px}px`;
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

		const label = document.createElement('div');
		label.classList.add('line-width-slider-label');
		label.textContent = `${this.settings.lineWidthPx}px`;

		const slider = document.createElement('input');
		slider.type = 'range';
		slider.min = '300';
		slider.max = '1600';
		slider.value = `${this.settings.lineWidthPx}`;
		slider.classList.add('line-width-slider');

		slider.addEventListener('input', async () => {
			const value = parseInt(slider.value);
			this.settings.lineWidthPx = value;
			label.textContent = `${value}px`;
			this.applyLineWidth();
			this.updateLineWidthTooltip();
			await this.saveData(this.settings);

			requestAnimationFrame(() => this.showWidthGuides());
			if (this.guideTimeout) window.clearTimeout(this.guideTimeout);
			this.guideTimeout = window.setTimeout(() => this.fadeOutWidthGuides(), 2000);
		});

		this.sliderPopup.appendChild(label);
		this.sliderPopup.appendChild(slider);

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

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) return;

		// Reading mode — calculate from container, same logic as updateEditorWidths
		const readingContainer = (
			activeView.containerEl.querySelector('.markdown-reading-view') ||
			document.querySelector('.workspace-leaf.mod-active .markdown-reading-view')
		) as HTMLElement | null;

		if (readingContainer && readingContainer.offsetParent !== null) {
			const sizerEl = readingContainer.querySelector('.markdown-preview-sizer') as HTMLElement;
			if (!sizerEl) return;
			const containerRect = readingContainer.getBoundingClientRect();
			const contentWidth = this.settings.lineWidthPx;
			const offsetX = (containerRect.width - contentWidth) / 2;

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
		const contentEl = (
			activeView.containerEl.querySelector('.cm-sizer') ||
			document.querySelector('.workspace-leaf.mod-active .cm-sizer')
		) as HTMLElement;
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
