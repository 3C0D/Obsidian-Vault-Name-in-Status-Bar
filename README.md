# Vault Name in Status Bar  

Add your vault name to the status bar in Obsidian, with customizable appearance and functionality.

## Features

- Displays your current vault name in the status bar
- Click to open a menu for quick vault switching
- Customizable appearance
- Vaut name length customizable. e.g: length=11 "A very long..."

## Settings

- **Color**: Choose the color of the vault name in the status bar
- **Font Size**: Adjust the font size of the vault name (in em)
- **Enable Maximum Length**: Option to truncate the vault name if it exceeds the maximum length
- **Maximum Length**: Set the maximum number of characters to display in the vault name

## Usage

- The vault name appears in the status bar
- Click on the vault name to open a menu with options to switch to other vaults or manage vaults
- The current vault is indicated with a checkmark in the menu

## Installation

1. copy files from the release
2. install them in your vault/.obsidian/plugins/status_vault_bar or use Brat

## Support

If you encounter any issues or have suggestions for improvements, please open an issue on the [GitHub repository](https://github.com/3C0D/Obsidian-Vault-Name-in-Status-Bar).

## License

This project is licensed under the MIT License.


## Development
### Environment Setup
  
- **Development in the plugins folder of your vault:**
  - Set the `REAL` variable to `-1` in the `.env` file. Or delete the file. Run the usual npm commands.

- **Development outside the vault:**
  - If your plugin's source code is outside the vault, the necessary files will be automatically copied to the targeted vault. Set the paths in the .env file. Use TestVault for the development vault and RealVault to simulate production.  
  
- **other steps:**   
  - You can then do `npm run version` to update the version and do the push of the changed files (package, manifest, version). Prompts will guide you.  
  
  - You can then do `npm run release` to create the release. Few seconds later you can see the created release in the GitHub releases.  

### Available Commands
  
*I recommend a `npm run start` then `npm run bacp` then `npm run version` then `npm run release`. Super fast and easy.*  
  
- **`npm run dev` and `npm start`**: For development. 
  `npm start` opens Visual Studio Code, runs `npm install`, and then `npm run dev`  
  
- **`npm run build`**: Builds the project in the folder containing the source code.  
  
- **`npm run real`**: Equivalent to a traditional installation of the plugin in your REAL vault.  
  
- **`npm run bacp`** & **`npm run acp`**: `b` stands for build, and `acp` stands for add, commit, push. You will be prompted for the commit message. 
  
- **`npm run version`**: Asks for the type of version update, modifies the relevant files, and then performs an add, commit, push.  
  
- **`npm run release`**: Asks for the release title, creates the release. This command works with the configurations in the `.github` folder. The release title can be multiline by using `\n`.