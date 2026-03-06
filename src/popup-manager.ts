import { MarkdownView, WorkspaceLeaf } from "obsidian";
import type { SBVNSettings } from "./interfaces.ts";
import { lockOpen, lockClosed } from "./variables.ts";
import { getLeafId, getFilePathForLeaf, getWidthForLeafPath, isFileLocked } from "./leaf-utils.ts";
import { WidthManager } from "./width-manager.ts";
import { WidthGuides } from "./guides.ts";

export class PopupManager {
	private activePopups: Map<string, HTMLDivElement> = new Map();
	private savedCursor: { from: { ch: number; line: number }; to: { ch: number; line: number } } | null = null;
	private savedCursorLeaf: WorkspaceLeaf | null = null;

	constructor(
		private getSettings: () => SBVNSettings,
		private saveData: (data: SBVNSettings) => Promise<void>,
		private saveDebounced: () => void,
		private widthManager: WidthManager,
		private guides: WidthGuides,
		private refreshLeafIcon: (leaf: WorkspaceLeaf) => void,
		private setActiveLeaf: (leaf: WorkspaceLeaf, opts: { focus: boolean }) => void
	) {}

	getActivePopups(): Map<string, HTMLDivElement> {
		return this.activePopups;
	}

	restoreCursor(): void {
		if (!this.getSettings().restoreCursorOnClose) return;
		if (this.savedCursor && this.savedCursorLeaf) {
			this.setActiveLeaf(this.savedCursorLeaf, { focus: true });
			const view = this.savedCursorLeaf.view instanceof MarkdownView ? this.savedCursorLeaf.view : null;
			view?.editor?.setSelection(this.savedCursor.from, this.savedCursor.to);
			this.savedCursor = null;
			this.savedCursorLeaf = null;
		}
	}

	onDocumentClick(e: MouseEvent, leafIcons: Map<string, HTMLDivElement>): void {
		this.activePopups.forEach((popup, leafId) => {
			const icon = leafIcons.get(leafId);
			if (
				!popup.contains(e.target as Node) &&
				!(icon && icon.contains(e.target as Node))
			) {
				popup.remove();
				this.activePopups.delete(leafId);
				const clickDoc = (e.target as Node).ownerDocument;
				const leafDoc = this.savedCursorLeaf?.containerEl.ownerDocument;
				if (clickDoc === leafDoc) {
					this.restoreCursor();
				}
			}
		});
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
		const ownerDoc = iconEl.ownerDocument;

		const popup = ownerDoc.createElement('div');
		popup.classList.add('line-width-slider-popup');

		const headerRow = ownerDoc.createElement('div');
		headerRow.classList.add('line-width-slider-header');

		const label = ownerDoc.createElement('div');
		label.classList.add('line-width-slider-label');

		const lockBtn = ownerDoc.createElement('button');
		lockBtn.classList.add('line-width-lock-btn');

		const slider = ownerDoc.createElement('input');
		slider.type = 'range';
		slider.min = '300';
		slider.max = '1600';
		slider.classList.add('line-width-slider');

		const updateLockState = (): void => {
			const settings = this.getSettings();
			const width = getWidthForLeafPath(filePath, settings);
			label.textContent = `${width}px`;
			slider.value = `${width}`;
			if (isFileLocked(filePath, settings)) {
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

		lockBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			if (!filePath) return;
			const s = this.getSettings();
			if (isFileLocked(filePath, s)) {
				delete s.localWidths[filePath];
				void this.saveData(s);
				this.widthManager.applyWidthToLeaf(leaf, s.lineWidthPx);
			} else {
				s.localWidths[filePath] = s.lineWidthPx;
				void this.saveData(s);
			}
			updateLockState();
		});

		slider.addEventListener('input', () => {
			const value = parseInt(slider.value);
			label.textContent = `${value}px`;
			const s = this.getSettings();

			if (isFileLocked(filePath, s)) {
				if (filePath) s.localWidths[filePath] = value;
				this.widthManager.applyWidthToLeaf(leaf, value);
			} else {
				s.lineWidthPx = value;
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

		const rect = iconEl.getBoundingClientRect();
		const ownerWin = ownerDoc.defaultView!;
		popup.style.position = 'fixed';
		popup.style.top = `${rect.bottom + 5}px`;
		popup.style.right = `${ownerWin.innerWidth - rect.right}px`;

		ownerDoc.body.appendChild(popup);
		this.activePopups.set(leafId, popup);
	}

	cleanup(): void {
		this.activePopups.forEach(popup => popup.remove());
		this.activePopups.clear();
	}
}
