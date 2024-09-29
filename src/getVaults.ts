import { readFileSync } from "fs";
import { Platform } from "obsidian";
import * as path from "path";
import * as os from "os";
import { ObsidianJsonConfig } from "./interfaces";

function getVaultsConfig(): string | null {
    const userDir: string = os.homedir();
    if (Platform.isWin) {
        return path.join(userDir, 'AppData', 'Roaming', 'obsidian', 'obsidian.json');
    } else if (Platform.isMacOS) {
        return path.join(userDir, 'Library', 'Application Support', 'obsidian', 'obsidian.json');
    } else if (Platform.isLinux) {
        return path.join(userDir, '.config', 'obsidian', 'obsidian.json');
    } else {
        console.log("should open explorer?")
        return null
    }
}



function readObsidianJson(): ObsidianJsonConfig | null {
    try {
        const vaultsConfigPath = getVaultsConfig();
        if (vaultsConfigPath) {
            const vaultsConfigContent = JSON.parse(readFileSync(vaultsConfigPath, "utf8"));
            return vaultsConfigContent as ObsidianJsonConfig;
        } else {
            return null;
        }
    } catch (err) {
        if (err instanceof SyntaxError) {
            console.error("Invalid JSON format in obsidian.json");
        } else if (err instanceof Error) {
            console.error("Error reading obsidian.json:", err.message);
        }
        return null;
    }
}

function getAllVaultPaths(): string[] | null {
    const obsidianConfig = readObsidianJson();
    if (obsidianConfig) {
        const paths: string[] = [];
        for (const key in obsidianConfig.vaults) {
            if (Object.prototype.hasOwnProperty.call(obsidianConfig.vaults, key)) {
                paths.push(obsidianConfig.vaults[key].path);
            }
        }
        return paths;
    } else {
        return null;
    }
}

export const vaultPaths = getAllVaultPaths()??[]


