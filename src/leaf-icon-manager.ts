import { Plugin, WorkspaceLeaf, setIcon, FileView } from "obsidian";
import type { SBVNSettings } from "./interfaces.ts";
import {
	getLeafId,
	getFilePathForLeaf,
	isFileLocked,
	getTooltipForLeaf,
} from "./leaf-utils.ts";
import { PopupManager } from "./popup-manager.ts";

/**
 * LeafIconManager
 *
 * This class manages the display of clickable icons in the header of each markdown tab.
 * It injects a width icon into each markdown leaf's header bar, allowing users to
 * toggle a popup for configuring the editor width for that specific file.
 *
 * The icons show a lock badge when the file is locked, and the icons are dynamically
 * updated when leaves are opened, closed, or when the layout changes.
 *
 * Methods:
 * - injectAll(): Injects icons into all markdown leaves, updates existing ones, and cleans up removed leaves.
 * - refresh(leaf: WorkspaceLeaf): Refreshes a specific leaf's icon (updates lock badge, tooltip, etc).
 * - cleanup(): Removes all icons and event listeners.
 * - refreshAll(): Calls injectAll() and updateAllColors() to fully refresh all icons.
 * - setPopupManager(popupManager: PopupManager): Sets the popup manager for handling popup windows.
 * - getLeafIcons(): Returns the map of leaf IDs to their icon elements.
 * - updateAllColors(): Updates the color of all icons based on current settings.
 */
export class LeafIconManager {
	private leafIcons: Map<string, HTMLDivElement> = new Map();
	private docsWithClickListener: Set<Document> = new Set();
	private popupManager: PopupManager | null = null;
	private iconClickHandlers: Map<string, (e: MouseEvent) => void> = new Map();

	constructor(
		private getSettings: () => SBVNSettings,
		private iterateAllLeaves: (cb: (leaf: WorkspaceLeaf) => void) => void,
		private registerDomEvent: Plugin["registerDomEvent"],
	) {}

	/**
	 * Sets the popup manager for handling popup windows
	 */
	setPopupManager(popupManager: PopupManager): void {
		this.popupManager = popupManager;
	}

	/**
	 * Returns the map of leaf IDs to their icon elements
	 */
	getLeafIcons(): Map<string, HTMLDivElement> {
		return this.leafIcons;
	}

	/**
	 * Updates the color of all icons based on current settings
	 */
	updateAllColors(): void {
		this.leafIcons.forEach((iconEl) => {
			iconEl.style.color = this.getSettings().lineWidthColor;
		});
	}

	/**
	 * Injects a width icon into each markdown tab header, updates badges,
	 * and cleans up icons for leaves that no longer exist.
	 * Called on layout ready and on every layout change.
	 */
	injectAll(): void {
		const activeLeafIds = new Set<string>();

		this.iterateAllLeaves((leaf) => {
			const settings = this.getSettings();
			activeLeafIds.add(getLeafId(leaf));
			const viewType = leaf.view?.getViewType();
			if (viewType !== "markdown") return;

			const leafId = getLeafId(leaf);
			if (!leafId) return;

			const existing = this.leafIcons.get(leafId);
			// If icon already exists for this leaf, just update visibility and refresh it
			if (existing && existing.isConnected) {
				existing.style.display = settings.enableLineWidth
					? "flex"
					: "none";
				this.refresh(leaf);
				return;
			}

			// The actions element is the header bar in each tab containing action buttons (close, menu, etc.)
			const actionsEl = (leaf.view as FileView).actionsEl;
			if (!actionsEl) return;

			// ownerDoc is needed to handle popup windows
			const ownerDoc = actionsEl.ownerDocument;
			// Register click handler on document to close popups when clicking outside
			if (
				!this.docsWithClickListener.has(ownerDoc) &&
				this.popupManager
			) {
				this.docsWithClickListener.add(ownerDoc);
				this.registerDomEvent(ownerDoc, "click", (e) =>
					this.popupManager!.onDocumentClick(e, this.leafIcons),
				);
			}

			// Create the icon element and prepend it to the actions
			const iconEl = ownerDoc.createElement("div");
			iconEl.classList.add("lw-leaf-icon");
			const iconSpan = ownerDoc.createElement("span");
			iconSpan.classList.add("lw-icon");
			setIcon(iconSpan, "chevrons-left-right-ellipsis");
			iconEl.appendChild(iconSpan);

			actionsEl.prepend(iconEl);
			// Store reference for later updates and cleanup
			this.leafIcons.set(leafId, iconEl);

			iconEl.style.color = settings.lineWidthColor;
			iconEl.style.display = settings.enableLineWidth ? "flex" : "none";
			this.refresh(leaf);

			// Add click handler to toggle popup
			const clickHandler = (e: MouseEvent): void => {
				e.stopPropagation();
				if (this.popupManager) {
					this.popupManager.togglePopupForLeaf(leaf, iconEl);
				}
			};
			iconEl.addEventListener("click", clickHandler);
			// Store handler for later removal
			this.iconClickHandlers.set(leafId, clickHandler);
		}); // end iterateAllLeaves

		// Clean up icons for leaves that no longer exist
		const toDelete: string[] = [];
		this.leafIcons.forEach((el, id) => {
			if (!activeLeafIds.has(id)) {
				toDelete.push(id);
			}
		});

		// Remove icons and their event listeners for leaves that are no longer active
		toDelete.forEach((id) => {
			const el = this.leafIcons.get(id);
			const handler = this.iconClickHandlers.get(id);

			// Remove event listener and element
			if (el && handler) {
				el.removeEventListener("click", handler);
			}
			el?.remove();

			// Clean up references
			this.leafIcons.delete(id);
			this.iconClickHandlers.delete(id);

			// Also remove any associated popup
			if (this.popupManager) {
				const popups = this.popupManager.getActivePopups();
				const popup = popups.get(id);
				if (popup) {
					popup.remove();
					popups.delete(id);
				}
			}
		});
	}

	/**
	 * Refreshes the icon for a specific leaf (updates lock badge, tooltip, etc)
	 */
	refresh(leaf: WorkspaceLeaf): void {
		const leafId = getLeafId(leaf);
		const iconEl = this.leafIcons.get(leafId);
		if (!iconEl) return;

		const settings = this.getSettings();
		const filePath = getFilePathForLeaf(leaf);
		const locked = isFileLocked(filePath, settings);

		const existingBadge = iconEl.querySelector(".lw-lock-badge");
		if (locked && !existingBadge) {
			const b = iconEl.ownerDocument.createElement("span");
			b.classList.add("lw-lock-badge");
			setIcon(b, "lock");
			iconEl.appendChild(b);
		} else if (!locked && existingBadge) {
			existingBadge.remove();
		}

		iconEl.setAttribute("aria-label", getTooltipForLeaf(leaf, settings));
	}

	/**
	 * Removes all icons and event listeners
	 */
	cleanup(): void {
		this.leafIcons.forEach((el, leafId) => {
			const handler = this.iconClickHandlers.get(leafId);
			if (handler) {
				el.removeEventListener("click", handler);
			}
			el.remove();
		});
		this.leafIcons.clear();
		this.iconClickHandlers.clear();
		this.docsWithClickListener.clear();
	}

	/**
	 * Calls injectAll() and updateAllColors() to fully refresh all icons
	 */
	refreshAll(): void {
		this.injectAll();
		this.updateAllColors();
	}
}
