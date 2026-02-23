export interface SBVNSettings {
	color: string;
	fontSize: number;
	maxTitleLength: number;
    enableMaxLength: boolean;
    reducedAtStart: boolean;
    enableLineWidth: boolean;
    lineWidthPercent: number;
    lineWidthColor: string;
}


export interface Vault {
    path: string;
    ts: number;
    open?: boolean;
}

export interface ObsidianJsonConfig {
    vaults: Record<string, Vault>;
    insider?: boolean;
}
