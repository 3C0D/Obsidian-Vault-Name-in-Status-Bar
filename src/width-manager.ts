import { WorkspaceLeaf } from "obsidian";
import type { SBVNSettings } from "./interfaces.ts";
import { getFilePathForLeaf, getWidthForLeafPath } from "./leaf-utils.ts";

export class WidthManager {
	private resizeObserver: ResizeObserver | null = null;

	constructor(
		private getSettings: () => SBVNSettings,
		private lineWidthStyleEl: HTMLStyleElement,
		private iterateAllLeaves: (cb: (leaf: WorkspaceLeaf) => void) => void
	) {}

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
		const settings = this.getSettings();
		if (settings.enableLineWidth) {
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
		this.iterateAllLeaves(leaf => {
			docs.add(leaf.containerEl.ownerDocument);
		});
		return Array.from(docs);
	}

	updateEditorWidths(): void {
		const settings = this.getSettings();
		this.iterateAllLeaves(leaf => {
			const filePath = getFilePathForLeaf(leaf);
			const px = getWidthForLeafPath(filePath, settings);
			this.applyWidthToLeaf(leaf, px);
		});
	}

	cleanupResizeObserver(): void {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
	}
}
