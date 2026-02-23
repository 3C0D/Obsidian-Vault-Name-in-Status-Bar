import { MarkdownView, Plugin } from "obsidian";
import { Settings } from "./settings.ts";
import { vaultsMenu } from "./menu.ts";
import { chevrons, chevronsHorizontal, DEFAULT_SETTINGS } from "./variables.ts";
import type { SBVNSettings } from "./interfaces.ts";

export default class StatusBarVaultName extends Plugin {
	settings: SBVNSettings;
	title: HTMLDivElement;
	lineWidthEl: HTMLDivElement;
	lineWidthStyleEl: HTMLStyleElement;
	sliderPopup: HTMLDivElement | null = null;
	leftGuide: HTMLDivElement | null = null;
	rightGuide: HTMLDivElement | null = null;
	guideTimeout: number = 0;
	boundClosePopup: (e: MouseEvent) => void;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new Settings(this.app, this));
		const vaultName = this.app.vault.getName();
		const statusBar = document.querySelector('.status-bar');

		this.title = document.createElement('div');
		this.title.innerHTML = this.settings.reducedAtStart ? `${chevrons}` : `${chevrons} ${vaultName}`;
		this.title.classList.add("status-bar-vault-name");
		this.updateTitleTooltip();

		this.lineWidthEl = document.createElement('div');
		this.lineWidthEl.innerHTML = chevronsHorizontal;
		this.lineWidthEl.classList.add("status-bar-line-width");
		this.updateLineWidthTooltip();

		statusBar?.prepend(this.lineWidthEl);
		statusBar?.prepend(this.title);

		this.updateTitleStyle();
		this.updateLineWidthElStyle();
		this.updateLineWidthVisibility();

		this.lineWidthStyleEl = document.createElement('style');
		document.head.appendChild(this.lineWidthStyleEl);
		this.applyLineWidth();

		this.title.addEventListener('click', (e) => vaultsMenu(this, this.app, e));

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
		this.title.detach();
		this.lineWidthEl.detach();
		this.lineWidthStyleEl.remove();
		this.hideSliderPopup();
		this.hideWidthGuides();
		document.removeEventListener('click', this.boundClosePopup);
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
		this.updateTitleStyle();
		this.updateVaultName();
		this.updateLineWidthElStyle();
		this.updateLineWidthVisibility();
		this.updateLineWidthTooltip();
		this.applyLineWidth();
	}

	updateTitleStyle(): void {
		this.title.style.color = this.settings.color;
		this.title.style.fontSize = `${this.settings.fontSize}em`;
	}

	updateVaultName(): void {
		const vaultName = this.app.vault.getName();
		this.title.innerHTML = this.settings.reducedAtStart ? `${chevrons}` : `${chevrons} ${this.getTruncatedVaultName(vaultName)}`;
		this.updateTitleTooltip();
	}

	updateTitleTooltip(): void {
		this.title.setAttribute('aria-label', "vault name");
	}

	getTruncatedVaultName(name: string): string {
		if (this.settings.enableMaxLength && name.length > this.settings.maxTitleLength) {
			return name.slice(0, this.settings.maxTitleLength) + '...';
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
			const p = this.settings.lineWidthPercent;
			this.lineWidthStyleEl.textContent =
            `body { --file-line-width: ${p}%; }` +
            // Live preview (readable line width disabled)
            `.cm-contentContainer { max-width: none !important; }` +
            `.cm-sizer { max-width: ${p}% !important; margin-left: auto !important; margin-right: auto !important; }` +
            // Reading mode
            `.markdown-preview-view .markdown-preview-sizer { width: ${p}% !important; max-width: 100% !important; margin-left: auto !important; margin-right: auto !important; box-sizing: border-box !important; }` +
            // Mermaid SVGs in reading mode
            `.markdown-preview-sizer .mermaid svg { max-width: 100% !important; height: auto !important; }`;
		} else {
			this.lineWidthStyleEl.textContent = '';
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

		// Try all possible selectors
		const contentEl = (
			activeView.containerEl.querySelector('.cm-sizer') ||
			activeView.containerEl.querySelector('.markdown-preview-sizer') ||
			document.querySelector('.workspace-leaf.mod-active .cm-sizer') ||
			document.querySelector('.workspace-leaf.mod-active .markdown-preview-sizer')
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
