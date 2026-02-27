import { MarkdownView, Plugin } from "obsidian";
import { Settings } from "./settings.ts";
import { vaultsMenu } from "./menu.ts";
import { chevrons, chevronsHorizontal, DEFAULT_SETTINGS } from "./variables.ts";
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
		this.vaultNameEl.innerHTML = this.settings.reducedAtStart ? `${chevrons}` : `${chevrons} ${this.getTruncatedVaultName(vaultName)}`;
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
		this.updateLineWidthElStyle();
		this.updateLineWidthVisibility();
		this.updateLineWidthTooltip();
		this.applyLineWidth();
	}

	updateVaultNameElStyle(): void {
		this.vaultNameEl.style.color = this.settings.color;
		this.vaultNameEl.style.fontSize = `${this.settings.fontSize}em`;
	}

	updateVaultName(): void {
		const vaultName = this.app.vault.getName();
		this.vaultNameEl.innerHTML = this.settings.reducedAtStart ? `${chevrons}` : `${chevrons} ${this.getTruncatedVaultName(vaultName)}`;
		this.updateVaultNameElTooltip();
	}

	updateVaultNameElTooltip(): void {
		this.vaultNameEl.setAttribute('aria-label', "vault name");
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
		this.lineWidthEl.setAttribute('aria-label', `Editor width: ${this.settings.lineWidthPercent}%`);
	}

	applyLineWidth(): void {
		if (this.settings.enableLineWidth) {
			// CSS: reset Obsidian constraints + centering only (no width here, handled by JS)
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
			document.querySelectorAll('.cm-sizer, .markdown-preview-sizer').forEach(el => {
				(el as HTMLElement).style.removeProperty('max-width');
				(el as HTMLElement).style.removeProperty('width');
			});
		}
	}

	setupResizeObserver(): void {
		this.cleanupResizeObserver();
		this.resizeObserver = new ResizeObserver(() => this.updateEditorWidths());
		const workspaceEl = document.querySelector('.workspace');
		if (workspaceEl) this.resizeObserver.observe(workspaceEl);
	}

	updateEditorWidths(): void {
		const p = this.settings.lineWidthPercent / 100;

		// Live preview / source mode — base width from .cm-editor (ignores readable line width)
		document.querySelectorAll('.cm-editor').forEach(editorEl => {
			const sizerEl = editorEl.querySelector('.cm-sizer') as HTMLElement;
			if (!sizerEl) return;
			const width = (editorEl as HTMLElement).clientWidth;
			if (width <= 0) return;
			sizerEl.style.maxWidth = `${Math.round(width * p)}px`;
		});

		// Reading mode
		document.querySelectorAll('.markdown-preview-view').forEach(previewEl => {
			const sizerEl = previewEl.querySelector('.markdown-preview-sizer') as HTMLElement;
			if (!sizerEl) return;
			const width = (previewEl as HTMLElement).clientWidth;
			if (width <= 0) return;
			sizerEl.style.maxWidth = `${Math.round(width * p)}px`;
			sizerEl.style.width = `${Math.round(width * p)}px`;
		});
	}

	cleanupResizeObserver(): void {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
	}

	detectCurrentLineWidth(): void {
		const computed = getComputedStyle(document.body).getPropertyValue('--file-line-width').trim();
		const editorEl = document.querySelector('.workspace-leaf.mod-active .cm-editor');
		if (!computed || !editorEl) return;

		const containerWidth = editorEl.clientWidth;
		if (containerWidth <= 0) return;

		let pxValue: number;
		if (computed.endsWith('px')) {
			pxValue = parseFloat(computed);
		} else if (computed.endsWith('rem')) {
			const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
			pxValue = parseFloat(computed) * rootFontSize;
		} else {
			return;
		}

		if (isNaN(pxValue)) return;
		const percent = Math.round((pxValue / containerWidth) * 100);
		// slider between 45 and 100
		this.settings.lineWidthPercent = Math.min(100, Math.max(45, percent));
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
		label.textContent = `${this.settings.lineWidthPercent}%`;

		const slider = document.createElement('input');
		slider.type = 'range';
		slider.min = '45';
		slider.max = '100';
		slider.value = `${this.settings.lineWidthPercent}`;
		slider.classList.add('line-width-slider');

		slider.addEventListener('input', async () => {
			const value = parseInt(slider.value);
			this.settings.lineWidthPercent = value;
			label.textContent = `${value}%`;
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
		this.sliderPopup.style.left = `${rect.left}px`;

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
			const contentWidth = Math.round(containerRect.width * this.settings.lineWidthPercent / 100);
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
		if (rect.width === 0) return;

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
