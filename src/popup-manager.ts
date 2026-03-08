import { App, MarkdownView, WorkspaceLeaf, setIcon } from "obsidian";
import type { SBVNSettings } from "./interfaces.ts";
import type { EditorPosition } from "obsidian";
import {
	getLeafId,
	getFilePathForLeaf,
	getWidthForLeafPath,
	isFileLocked,
} from "./leaf-utils.ts";
import { WidthManager } from "./width-manager.ts";
import { WidthGuides } from "./guides.ts";

interface CursorState {
	from: EditorPosition;
	to: EditorPosition;
}

/**
 * PopupManager
 *
 * This class manages the width adjustment popups that appear when clicking
 * on the width icons in the markdown tab headers.
 *
 * Features:
 * - Shows a popup with a slider for adjusting editor width
 * - Handles locking/unlocking of width settings per file
 * - Saves cursor position when opening popup
 * - Restores cursor position when closing popup
 * - Manages popup lifecycle (creation, removal, closing)
 * - Integrates with WidthManager and WidthGuides
 *
 * Methods:
 * - getActivePopups(): Returns the map of active popups
 * - restoreCursor(leafId: string, leaf: WorkspaceLeaf): Restores cursor position
 * - onDocumentClick(e: MouseEvent, leafIcons: Map<string, HTMLDivElement>): Closes popups on outside clicks
 * - findLeafById(leafId: string): Finds a leaf by its ID
 * - toggleLock(leaf: WorkspaceLeaf, filePath: string | null, updateLockState: () => void): Toggles lock state
 * - scheduleGuidesUpdate(leaf: WorkspaceLeaf): Schedules an update for width guides
 * - togglePopupForLeaf(leaf: WorkspaceLeaf, iconEl: HTMLDivElement): Toggles popup visibility
 * - showPopupForLeaf(leaf: WorkspaceLeaf, iconEl: HTMLDivElement): Creates and shows a new popup
 * - cleanup(): Removes all popups and clears data
 */
export class PopupManager {
	private activePopups: Map<string, HTMLDivElement> = new Map();
	private savedCursor: { leafId: string; state: CursorState } | null = null;

	constructor(
		private app: App,
		private getSettings: () => SBVNSettings,
		private saveData: (data: SBVNSettings) => Promise<void>,
		private saveDebounced: () => void,
		private widthManager: WidthManager,
		private guides: WidthGuides,
		private refreshLeafIcon: (leaf: WorkspaceLeaf) => void,
		private setActiveLeaf: (
			leaf: WorkspaceLeaf,
			opts: { focus: boolean },
		) => void,
	) {}

	/**
	 * Returns the map of active popups (leafId -> popup element)
	 */
	getActivePopups(): Map<string, HTMLDivElement> {
		return this.activePopups;
	}

	/**
	 * Restores focus and  cursor position and selection
	 */
	restoreCursor(leafId: string, leaf: WorkspaceLeaf): void {
		if (!this.getSettings().restoreCursorOnClose) return;
		const cursor =
			this.savedCursor?.leafId === leafId ? this.savedCursor.state : null;
		if (cursor) {
			this.setActiveLeaf(leaf, { focus: true });
			const view = leaf.view instanceof MarkdownView ? leaf.view : null;
			view?.editor?.setSelection(cursor.from, cursor.to);
			this.savedCursor = null;
		}
	}

	/**
	 * Closes popups when clicking outside of them or their associated icons
	 */
	onDocumentClick(
		e: MouseEvent,
		leafIcons: Map<string, HTMLDivElement>,
	): void {
		// Collect popups that need to be closed (click was outside the popup and its icon)
		const toClose: Array<{
			leafId: string;
			popup: HTMLDivElement;
			leaf?: WorkspaceLeaf;
		}> = [];

		// Check each active popup to see if the click was outside
		this.activePopups.forEach((popup, leafId) => {
			const icon = leafIcons.get(leafId);
			if (
				!popup.contains(e.target as Node) &&
				!(icon && icon.contains(e.target as Node))
			) {
				toClose.push({ leafId, popup });
			}
		});

		// Close collected popups and restore cursor position
		const clickDoc = (e.target as Node).ownerDocument;
		toClose.forEach(({ leafId, popup }) => {
			popup.remove();
			this.activePopups.delete(leafId);
			const leaf = this.findLeafById(leafId);
			if (leaf && leaf.containerEl.ownerDocument === clickDoc) {
				this.restoreCursor(leafId, leaf);
			}
		});
	}

	/**
	 * Finds a leaf by its ID
	 */
	private findLeafById(leafId: string): WorkspaceLeaf | null {
		let found: WorkspaceLeaf | null = null;
		this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			if (getLeafId(leaf) === leafId) found = leaf;
		});
		return found;
	}

	/**
	 * Toggles the lock state for a file's width setting.
	 * - If locking, saves the current global width as a local override.
	 * - If unlocking, removes the local override to fall back to the global width.
	 *
	 * Updates the popup UI and refreshes the leaf icon to reflect the new state.
	 */
	private toggleLock(
		leaf: WorkspaceLeaf,
		filePath: string | null,
		updateLockState: () => void,
	): void {
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
	}

	private guidesUpdateScheduled = false;
	/**
	 * Schedules an update for width guides after a short delay.
	 * Uses requestAnimationFrame to defer the update until after the DOM has been laid out.
	 * Prevents multiple rapid updates by checking if an update is already scheduled.
	 */
	private scheduleGuidesUpdate(leaf: WorkspaceLeaf): void {
		if (this.guidesUpdateScheduled) return;
		this.guidesUpdateScheduled = true;
		// Use rAF to wait for DOM layout before calculating guide positions. 60 FPS
		requestAnimationFrame(() => {
			this.guides.showWidthGuidesForLeaf(leaf);
			this.guidesUpdateScheduled = false;
		});
	}

	/**
	 * Toggles the visibility of a popup for a given leaf.
	 * - If popup exists, removes it and restores cursor.
	 * - If popup doesn't exist, creates and shows it.
	 */
	togglePopupForLeaf(leaf: WorkspaceLeaf, iconEl: HTMLDivElement): void {
		const leafId = getLeafId(leaf);
		const existing = this.activePopups.get(leafId);
		if (existing) {
			existing.remove();
			this.activePopups.delete(leafId);
			this.restoreCursor(leafId, leaf);
		} else {
			this.showPopupForLeaf(leaf, iconEl);
		}
	}

	/**
	 * Creates and displays a width adjustment popup for the specified leaf.
	 * Saves cursor position, closes other popups, builds the DOM,
	 * wires up the slider and lock button, then mounts and positions the popup.
	 */
	showPopupForLeaf(leaf: WorkspaceLeaf, iconEl: HTMLDivElement): void {
		const leafId = getLeafId(leaf);

		// Save cursor position so it can be restored when the popup is closed
		const view = leaf.view instanceof MarkdownView ? leaf.view : null;
		const editor = view?.editor;
		if (editor) {
			this.savedCursor = {
				leafId,
				state: {
					from: editor.getCursor("anchor"),
					to: editor.getCursor("head"),
				},
			};
		}

		// Close any other open popup (only one popup at a time)
		this.activePopups.forEach((popup, id) => {
			if (id !== leafId) {
				popup.remove();
				this.activePopups.delete(id);
			}
		});

		// Build popup DOM structure
		const filePath = getFilePathForLeaf(leaf);
		const ownerDoc = iconEl.ownerDocument;
		const ownerWin = ownerDoc.defaultView;
		if (!ownerWin) return;

		const popup = ownerDoc.createElement("div");
		popup.classList.add("line-width-slider-popup");

		const headerRow = ownerDoc.createElement("div");
		headerRow.classList.add("line-width-slider-header");

		const label = ownerDoc.createElement("div");
		label.classList.add("line-width-slider-label");

		const lockBtn = ownerDoc.createElement("button");
		lockBtn.classList.add("line-width-lock-btn");

		const slider = ownerDoc.createElement("input");
		slider.type = "range";
		slider.min = "300";
		slider.max = "1600";
		slider.classList.add("line-width-slider");

		// Updates the popup UI to reflect the current lock state and width for this file
		const updateLockState = (): void => {
			const settings = this.getSettings();
			const width = getWidthForLeafPath(filePath, settings);
			label.textContent = `${width}px`;
			slider.value = `${width}`;
			lockBtn.innerHTML = "";
			if (isFileLocked(filePath, settings)) {
				setIcon(lockBtn, "lock");
				lockBtn.style.color = "var(--interactive-accent)";
				lockBtn.setAttribute(
					"aria-label",
					"Local width (this file only)",
				);
			} else {
				setIcon(lockBtn, "unlock");
				lockBtn.style.color = "var(--text-muted)";
				lockBtn.setAttribute("aria-label", "Global width (all files)");
			}
			this.refreshLeafIcon(leaf);
		};

		// Toggle lock on click: switches between local (per-file) and global width
		lockBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.toggleLock(leaf, filePath, updateLockState);
		});

		// Apply width change live as the slider moves
		slider.addEventListener("input", () => {
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
			this.scheduleGuidesUpdate(leaf);
			this.guides.scheduleHide(2000);
		});

		headerRow.appendChild(label);
		headerRow.appendChild(lockBtn);
		popup.appendChild(headerRow);
		popup.appendChild(slider);

		// Initialize UI with current state before mounting
		updateLockState();

		// Position popup just below the icon
		const rect = iconEl.getBoundingClientRect();
		popup.style.position = "fixed";
		popup.style.top = `${rect.bottom + 5}px`;
		popup.style.right = `${ownerWin.innerWidth - rect.right}px`;

		// Mount popup and register it as active
		ownerDoc.body.appendChild(popup);
		this.activePopups.set(leafId, popup);
	}

	/**
	 * Cleans up all popups and saved cursor positions
	 */
	cleanup(): void {
		this.activePopups.forEach((popup) => popup.remove());
		this.activePopups.clear();
		this.savedCursor = null;
	}
}
