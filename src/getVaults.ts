import { readFileSync } from "fs";
import { Platform } from "obsidian";
import * as path from "path";
import * as os from "os";
import type { ObsidianJsonConfig } from "./interfaces.ts";

function getVaultsConfigPath(): string | null {
	const userDir = os.homedir();
	if (Platform.isWin)
		return path.join(userDir, 'AppData', 'Roaming', 'obsidian', 'obsidian.json');
	if (Platform.isMacOS)
		return path.join(userDir, 'Library', 'Application Support', 'obsidian', 'obsidian.json');
	if (Platform.isLinux)
		return path.join(userDir, '.config', 'obsidian', 'obsidian.json');
	return null;
}

export function getVaultPaths(): string[] {
	try {
		const configPath = getVaultsConfigPath();
		if (!configPath) return [];
		const config = JSON.parse(readFileSync(configPath, "utf8")) as ObsidianJsonConfig;
		return Object.values(config.vaults).map(v => v.path);
	} catch {
		return [];
	}
}
