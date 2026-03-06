import { WorkspaceLeaf } from "obsidian";

export class WidthGuides {
	leftGuide: HTMLDivElement | null = null;
	rightGuide: HTMLDivElement | null = null;
	guideTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private getWidthForLeafPath: (filePath: string | null) => number,
		private getFilePathForLeaf: (leaf: WorkspaceLeaf) => string | null
	) {}

	showWidthGuidesForLeaf(leaf: WorkspaceLeaf): void {
		this.hideWidthGuides();

		const ownerDoc = leaf.containerEl.ownerDocument;
		const filePath = this.getFilePathForLeaf(leaf);
		const px = this.getWidthForLeafPath(filePath);
		const containerEl = leaf.containerEl as HTMLElement;

		// Reading mode: full-width container — auto margins are on a child element, so position must be calculated manually
		const readingContainer = containerEl.querySelector('.markdown-reading-view') as HTMLElement | null;
		if (readingContainer && readingContainer.offsetParent !== null) {
			const rect = readingContainer.getBoundingClientRect();
			if (rect.width === 0) return;
			// Side margin (centering offset)
			const offsetX = Math.max(0, (rect.width - px) / 2);

			this.leftGuide = ownerDoc.createElement('div');
			this.leftGuide.classList.add('line-width-guide');
			// Going from the left edge of the container, add the offset to get to the left guide position
			this.leftGuide.style.left = `${rect.left + offsetX}px`;
			this.leftGuide.style.top = `${rect.top}px`;
			this.leftGuide.style.height = `${containerEl.getBoundingClientRect().bottom - rect.top}px`;

			this.rightGuide = ownerDoc.createElement('div');
			this.rightGuide.classList.add('line-width-guide');
			// Going from the left edge of the container, add leaf width and offset to get to the right guide position
			this.rightGuide.style.left = `${rect.left + px + offsetX}px`;
			this.rightGuide.style.top = `${rect.top}px`;
			this.rightGuide.style.height = `${containerEl.getBoundingClientRect().bottom - rect.top}px`;

			ownerDoc.body.appendChild(this.leftGuide);
			ownerDoc.body.appendChild(this.rightGuide);
			return;
		}

		// Live preview / source mode: cm-sizer has auto margins, so its edges are already the text edges
		const contentEl = containerEl.querySelector('.cm-sizer') as HTMLElement | null;
		if (!contentEl) return;
		if (contentEl.offsetParent === null) return;

		const rect = contentEl.getBoundingClientRect();
		if (rect.width === 0) return;

		this.leftGuide = ownerDoc.createElement('div');
		this.leftGuide.classList.add('line-width-guide');
		// Left edge of the content. Simple because cm-sizer is already centered with auto margins
		this.leftGuide.style.left = `${rect.left}px`;
		this.leftGuide.style.top = `${rect.top}px`;
		this.leftGuide.style.height = `${containerEl.getBoundingClientRect().bottom - rect.top}px`;

		this.rightGuide = ownerDoc.createElement('div');
		this.rightGuide.classList.add('line-width-guide');
		// Right edge of the content
		this.rightGuide.style.left = `${rect.right}px`;
		this.rightGuide.style.top = `${rect.top}px`;
		this.rightGuide.style.height = `${containerEl.getBoundingClientRect().bottom - rect.top}px`;

		ownerDoc.body.appendChild(this.leftGuide);
		ownerDoc.body.appendChild(this.rightGuide);
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
		setTimeout(() => this.hideWidthGuides(), 500);
	}

	scheduleHide(delay: number): void {
		if (this.guideTimeout) clearTimeout(this.guideTimeout);
		this.guideTimeout = setTimeout(() => this.fadeOutWidthGuides(), delay);
	}

	cleanup(): void {
		this.hideWidthGuides();
		if (this.guideTimeout) clearTimeout(this.guideTimeout);
	}
}
