# BRT (Bundle Ref Table) Tools
This tool allows for reading, writing, and converting BundleRefTable resources from EA's Frostbite game engine to and from a JSON format.

BundleRefTable (BRT) resources are used in various Frostbite games (mostly EA Sports titles) to lookup game assets based on an assetname string. The resource contains a list of assets, a list of bundles, and a list of lookups. Each lookup contains a hash (corresponding to the hash of the assetname string it corresponds to), an asset index pointing to the asset in the asset list, and a bundle index pointing to the bundle that contains the asset. This allows the game to lookup a given assetname and know which bundle must be loaded to load the asset.

This means in order to add new assets for modding, they must be added to the BRT resource. This tool greatly simplifies this process by converting the messy binary resource format into a JSON format that can be easily edited and then converting it back to the resource format so that it can be imported into the game. 

## Supported Functionality
- Convert BRT .res file to .json
- Convert .json file to BRT .res file
- Add entries for duplicated assets to a BRT JSON file using a provided Excel file

## Currently Supported Games (full support unless otherwise noted)
- Madden NFL 24
- Madden NFL 25
- EA SPORTS FC 24
- Dragon Age: The Veilguard

## Adding New Games
- Before a game can be added to the supported games list, it must be tested. To do this, take a BRT resource from the game, convert it to JSON, and then convert the JSON back to BRT resource without any modifications. Then, attempt to use the converted resource in the game and see if it still works as expected.
- Open a new issue with your findings. Include what game(s) you have tested. Please include a copy of the original BRT resource from the game(s), especially if it does not work.

## Usage
1. Download the latest executable from [releases](https://github.com/WiiExpertise/brt-tools/releases/latest)
2. Run the executable and follow the included prompts

## Excel File For Adding Asset Entries
The option to add entries for duplicated assets based on an Excel file requires an Excel file formatted with the first column containing the path to each duplicated asset, while the second column contains the path to the corresponding original asset. It should also include the appropriate column headers. For example:
### Spreadsheet
| Dupe | Original |
| ---- | ------- |
| content/my_new_asset | content/asset |
| ... | ... |
| ... | ... |

## Building
1. Clone the repository:
   ```bash
    git clone https://github.com/WiiExpertise/brt-tools.git
    ```
2. Navigate to the project directory:
 
    ```bash
    cd brt-tools
    ```
3. Install dependencies:

    ```bash
    npm install
    ```
4. Run the tool:

    ```bash
    node brtTools.js
    ```
## Building Executable
To build this tool into an executable, you can use [nexe](https://github.com/nexe/nexe). To install nexe globally:

```bash
npm install -g nexe
```

Please note that nexe requires both Python and NASM to be installed. You can download Python [here](https://www.python.org/downloads/) (version 3.9 is recommended). You can download NASM [here](https://www.nasm.us/).

Once you have nexe installed, you can simply run the ``buildExe.bat`` script included with this repository. Feel free to modify it if needed to fit your application.

## Acknowledgements
Thanks to the following people for their contributions:
- **wannkunstbeikor** - For researching the BRT resource format and providing the format information. This project would not be possible otherwise.
