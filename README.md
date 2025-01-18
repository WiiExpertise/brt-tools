# BRT (Bundle Ref Table) Tools
This tool allows for reading, writing, and converting BundleRefTable resources from EA's Frostbite game engine to a JSON format

## Supported Functionality
- Convert BRT .res file to .json
- Convert .json file to BRT .res file

## Supported Games
- Madden NFL 25 (BRT <-> JSON)
- EA SPORTS FC 24 (BRT <-> JSON)

## To Do List
- Add support for different BRT format versions

## Usage
1. Download the latest executable from [releases](https://github.com/WiiExpertise/brt-tools/releases/latest)
2. Run the executable and follow the included prompts

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
