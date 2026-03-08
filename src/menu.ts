import { addIcon, App, Menu, FileSystemAdapter } from "obsidian";
import { vaults_picker } from "./variables.ts";
import { getVaultPaths } from "./getVaults.ts";
import StatusBarVaultName from "./main.ts";

addIcon("buttonSVG", vaults_picker);

/**
 * Creates and displays a context menu for vault management.
 *
 * This function creates a menu that provides the following options:
 * - Toggle minimize/maximize vault name display
 * - List of all available vaults to switch to (with checkmark for current vault)
 * - Button to open the vault chooser
 */
export function vaultsMenu(
	plugin: StatusBarVaultName,
	app: App,
	evt: MouseEvent,
): void {
	const menu = new Menu();

	menu.addItem((item) => {
		item.setTitle(
			`${plugin.settings.reducedAtStart ? "Maximize" : "Minimize"} Vault Name`,
		).onClick(async () => {
			plugin.settings.reducedAtStart = !plugin.settings.reducedAtStart;
			await plugin.saveSettings();
		});
	});

	menu.addSeparator();

	const adapter = app.vault.adapter;
	const currentVaultPath =
		adapter instanceof FileSystemAdapter ? adapter.basePath : undefined;
	const vaultPaths = getVaultPaths();

	vaultPaths.forEach((vaultPath) => {
		const vaultName = getName(vaultPath);
		const title =
			currentVaultPath === vaultPath
				? `${vaultName}\u00A0\u00A0\u00A0\u2713`
				: vaultName;

		menu.addItem((item) => {
			item.setTitle(title).onClick(async () => {
				if (currentVaultPath !== vaultPath) {
					window.open(
						`obsidian://open?vault=${encodeURIComponent(vaultName)}`,
					);
				}
			});
		});
	});

	menu.addSeparator();

	menu.addItem((item) => {
		item.setTitle("Vaults")
			.setIcon("buttonSVG")
			.onClick(async () => {
				app.openVaultChooser();
			});
	});
	menu.showAtMouseEvent(evt);
}

/**
 * Extracts the name of a vault from its file path.
 */
function getName(path: string): string {
	return path.split(/[/\\]/).pop() || "";
}
