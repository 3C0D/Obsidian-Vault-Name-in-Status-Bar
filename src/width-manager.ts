import { WorkspaceLeaf, debounce } from "obsidian";
import type { SBVNSettings } from "./interfaces.ts";
import { getFilePathForLeaf, getWidthForLeafPath } from "./leaf-utils.ts";

/**
 * WidthManager
 * This class manages the width of editor views.
 *
 * It applies width settings to leaves and handles dynamic updates
 * when the layout changes or settings are modified.
 *
 * Features:
 * - Apply fixed widths to editor views
 * - Update widths dynamically based on settings
 * - Handle layout changes and window resizing
 * - Manage CSS styles for line width
 *
 * Methods:
 * - applyWidthToLeaf(leaf: WorkspaceLeaf, px: number): Applies a width to a leaf
 * - applyLineWidth(): Applies line width CSS rules
 * - setupResizeObserver(): Sets up observer for layout changes
 * - getAllDocuments(): Gets all documents with leaves
 * - updateEditorWidths(): Updates all editor widths
 * - cleanupResizeObserver(): Cleans up the resize observer
 */
export class WidthManager {
	private resizeObserver: ResizeObserver | null = null;
	private updateEditorWidthsDebounced: () => void;

	constructor(
		private getSettings: () => SBVNSettings,
		private lineWidthStyleEl: HTMLStyleElement,
		private iterateAllLeaves: (cb: (leaf: WorkspaceLeaf) => void) => void,
	) {
		this.updateEditorWidthsDebounced = debounce(
			() => this.updateEditorWidths(),
			100,
			false,
		);
	}

	/**
	 * Applies a width directly to a specific leaf's DOM elements
	 */
	applyWidthToLeaf(leaf: WorkspaceLeaf, px: number): void {
		const containerEl = leaf.containerEl as HTMLElement;
		containerEl.querySelectorAll(".cm-sizer").forEach((el) => {
			(el as HTMLElement).style.maxWidth = `${px}px`;
		});
		containerEl
			.querySelectorAll(".markdown-preview-sizer")
			.forEach((el) => {
				(el as HTMLElement).style.maxWidth = `${px}px`;
				(el as HTMLElement).style.width = `${px}px`;
			});
	}

	/**
	 * Applies the line width CSS rules to enable custom line widths
	 */
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
			this.lineWidthStyleEl.textContent = "";
			this.cleanupResizeObserver();
			this.getAllDocuments().forEach((doc) => {
				doc.querySelectorAll(
					".cm-sizer, .markdown-preview-sizer",
				).forEach((el) => {
					(el as HTMLElement).style.removeProperty("max-width");
					(el as HTMLElement).style.removeProperty("width");
				});
			});
		}
	}

	/**
	 * Sets up a ResizeObserver to watch for layout changes and update widths accordingly
	 */
	setupResizeObserver(): void {
		this.cleanupResizeObserver();
		this.resizeObserver = new ResizeObserver(() =>
			this.updateEditorWidthsDebounced(),
		);
		const workspaceEl = document.querySelector(".workspace");
		if (workspaceEl) {
			this.resizeObserver.observe(workspaceEl);
		} else {
			console.warn("Workspace element not found for ResizeObserver");
		}
	}

	/**
	 * Gets all documents with leaves (including main document and popup windows)
	 */
	getAllDocuments(): Document[] {
		const docs = new Set<Document>();
		docs.add(document);
		this.iterateAllLeaves((leaf) => {
			docs.add(leaf.containerEl.ownerDocument);
		});
		return Array.from(docs);
	}

	/**
	 * Updates all editor widths based on current settings
	 */
	updateEditorWidths(): void {
		const settings = this.getSettings();
		this.iterateAllLeaves((leaf) => {
			const filePath = getFilePathForLeaf(leaf);
			const px = getWidthForLeafPath(filePath, settings);
			this.applyWidthToLeaf(leaf, px);
		});
	}

	/**
	 * Cleans up the resize observer
	 */
	cleanupResizeObserver(): void {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
	}
}
