import { WorkspaceLeaf, MarkdownView, FileView } from "obsidian";
import type { SBVNSettings } from "./interfaces.ts";

/**
 * Returns a stable id for a leaf
 */
export function getLeafId(leaf: WorkspaceLeaf): string {
	return leaf.id ?? '';
}

/**
 * Gets the file path associated with a leaf
 */
export function getFilePathForLeaf(leaf: WorkspaceLeaf): string | null {
	if (leaf.view instanceof MarkdownView) {
		return leaf.view.file?.path ?? null;
	}
	return (leaf.view as FileView).file?.path ?? null;
}

/**
 * Gets the width for a given file path based on settings
 */
export function getWidthForLeafPath(filePath: string | null, settings: SBVNSettings): number {
	if (filePath && settings.localWidths[filePath] !== undefined) {
		return settings.localWidths[filePath];
	}
	return settings.lineWidthPx;
}

/**
 * Checks if a file has a local width override (locked state)
 */
export function isFileLocked(filePath: string | null, settings: SBVNSettings): boolean {
	return filePath !== null && settings.localWidths[filePath] !== undefined;
}

/**
 * Generates the tooltip text for a leaf
 */
export function getTooltipForLeaf(leaf: WorkspaceLeaf, settings: SBVNSettings): string {
	const filePath = getFilePathForLeaf(leaf);
	const width = getWidthForLeafPath(filePath, settings);
	const locked = isFileLocked(filePath, settings);
	return `Editor width: ${width}px${locked ? ' (local)' : ' (global)'}`;
}
