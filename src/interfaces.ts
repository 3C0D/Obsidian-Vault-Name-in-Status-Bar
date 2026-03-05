export interface SBVNSettings {
	color: string;
	fontSize: number;
	maxVaultNameLength: number;
    enableMaxLength: boolean;
    reducedAtStart: boolean;
    enableVaultName: boolean;
    enableLineWidth: boolean;
    lineWidthPx: number;
    lineWidthColor: string;
    localWidths: Record<string, number>; // { "path/to/file.md": 800 }
    restoreCursorOnClose: boolean;
}


export interface Vault {
    path: string;
    ts: number; //timestamp of last modification
    open?: boolean;
}

export interface ObsidianJsonConfig {
    vaults: Record<string, Vault>;
    insider?: boolean;
}
