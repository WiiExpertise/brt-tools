(async() => {
	// Required modules
	const fs = require('fs');
	const prompt = require('prompt-sync')();
	const utilFunctions = require('./utils/UtilFunctions');
	const { FileParser } = require('./utils/FileParser');
	const brtManager = require('./utils/BrtManager');

	// Version number constant
	const VERSION_STRING = "v1.0";

	// Global constants
	let BRT_HEADER_SIZE = 0x70; // Not constant due to format variations
	const BRT_BUNDLE_REF_SIZE = 0x18;
	const BRT_ASSET_SIZE = 0x10;
	const BRT_ASSET_LOOKUP_SIZE = 0x10;
	const BRT_BUNDLE_SIZE = 0x10;

	const BRT_FORMATS = {
		BRT_NO_GUID: 0,
		BRT_GUID: 1,
		BRT_COMPRESSED_STRINGS: 2
	}

	// We currently don't support these formats (not enough information on them)
	const unsupportedFormats = [
		BRT_FORMATS.BRT_COMPRESSED_STRINGS
	];

	// BRT format mapping for different games
	const GAME_FORMATS = {
		"Madden NFL 24": BRT_FORMATS.BRT_NO_GUID,
		"Madden NFL 25": BRT_FORMATS.BRT_GUID,
		"EA SPORTS FC 24": BRT_FORMATS.BRT_GUID,
		"EA SPORTS FC 25": BRT_FORMATS.BRT_COMPRESSED_STRINGS,
		"Dragon Age: The Veilguard": BRT_FORMATS.BRT_NO_GUID
	}

	// Global variables
	let assetLookupsPtr;
	let bundleRefsPtr;
	let assetsPtr;
	let bundlesPtr;
	let bundleCount = 0;

	function readBundleRefs(fileReader, brtJson)
	{
		fileReader.offset = bundleRefsPtr;

		const bundleRefs = [];

		for(let i = 0; i < brtJson.bundleRefCount; i++)
		{
			const bundleRef = {};

			const namePtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));
			const name = fileReader.readNullTerminatedString(namePtr);

			const dirPtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));
			const directory = fileReader.readNullTerminatedString(dirPtr);

			bundleRef["Name"] = name;

			bundleRef["Directory"] = directory;

			const bundlePtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));
			const bundleIndex = Math.floor((bundlePtr - bundlesPtr) / 0x10);

			bundleRef["BundleIndex"] = bundleIndex;

			bundleRefs.push(bundleRef);

			bundleCount = Math.max(bundleCount, bundleIndex + 1);
		}

		brtJson["bundleRefs"] = bundleRefs;
	}

	function readAssets(fileReader, brtJson)
	{
		fileReader.offset = assetsPtr;

		const assets = [];

		for(let i = 0; i < brtJson.assetCount; i++)
		{
			const asset = {};

			const namePtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));
			const name = fileReader.readNullTerminatedString(namePtr);

			const pathPtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));
			const path = fileReader.readNullTerminatedString(pathPtr);

			asset["Name"] = name;
			asset["Path"] = path;

			assets.push(asset);
		}

		brtJson["assets"] = assets;
	}

	function readAssetLookups(fileReader, brtJson)
	{
		fileReader.offset = assetLookupsPtr;

		const assetLookups = [];

		for(let i = 0; i < brtJson.assetLookupCount; i++)
		{
			const assetLookup = {};

			const rawHash = fileReader.readBytes(8);
			const hash = BigInt(rawHash.readBigUInt64LE(0));

			// Convert rawHash to hex string
			const hexHash = rawHash.toString('hex');
			const bundleRefIndex = fileReader.readBytes(4).readUInt32LE(0);
			const assetIndex = fileReader.readBytes(4).readUInt32LE(0);

			assetLookup["Hash"] = hash.toString();
			assetLookup["HexHash"] = hexHash;
			assetLookup["BundleRefIndex"] = bundleRefIndex;
			assetLookup["AssetIndex"] = assetIndex;

			assetLookups.push(assetLookup);
		}

		brtJson["assetLookups"] = assetLookups;
	}

	function readBundles(fileReader, brtJson)
	{
		fileReader.offset = bundlesPtr;

		const bundles = [];

		for(let i = 0; i < bundleCount; i++)
		{
			const bundle = {};

			const namePtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));
			const name = fileReader.readNullTerminatedString(namePtr);

			const parentBundlePtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));
			const parentBundleIndex = Math.floor((parentBundlePtr - bundlesPtr) / 0x10);

			bundle["Name"] = name;
			bundle["ParentBundleIndex"] = parentBundleIndex;

			bundles.push(bundle);
		}

		brtJson["bundles"] = bundles;
	}

	// Function to convert BRT resource to JSON
	async function convertBrtToJson()
	{
		// Get the path of the BRT file
		let path = prompt("Enter the path to the BRT resource file: ").trim();

		// Check if the file exists
		if(!fs.existsSync(path))
		{
			console.log("File does not exist. Please enter a valid path.");
			return;
		}

		let brtJson = {};

		// Get the BRT format from the user, so we can read the file correctly, as different games have slightly different formats
		const brtFormat = getBrtFormat();

		if(unsupportedFormats.includes(brtFormat))
		{
			console.log("Unsupported BRT format. Aborting.");
			return;
		}

		// Read the file
		const resourceData = fs.readFileSync(path).subarray(0x10);
		const fileReader = new FileParser(resourceData);

		const brtNamePtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));
		const brtName = fileReader.readNullTerminatedString(brtNamePtr);

		brtJson["brtName"] = brtName;
		brtJson["brtFormat"] = brtFormat;

		//console.log(`BundleRefTable name: ${brtName}`);
		//console.log(`Current offset: ${fileReader.offset}`);

		assetLookupsPtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));
		bundleRefsPtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));
		assetsPtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));
		bundlesPtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));

		const unkStringPtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));
		const unkString = fileReader.readNullTerminatedString(unkStringPtr);

		if(unkString !== "")
		{
			console.log("Weird BRT format, expected empty string but got: " + unkString);
		}

		if(brtFormat === BRT_FORMATS.BRT_GUID)
		{
			const brtInstanceGuid = utilFunctions.readGUID(fileReader.readBytes(16));
			brtJson["brtInstanceGuid"] = brtInstanceGuid;
			fileReader.readBytes(16); // Skip 16 bytes
		}

		const assetLookupCount = fileReader.readBytes(4).readUInt32LE(0);
		const bundleRefCount = fileReader.readBytes(4).readUInt32LE(0);
		const assetCount = fileReader.readBytes(4).readUInt32LE(0);

		const unkZero1 = fileReader.readBytes(4).readUInt32LE(0);

		const unkHash = fileReader.readBytes(4).readUInt32LE(0);

		const unkZero2 = fileReader.readBytes(4).readUInt32LE(0);
		const unkOne = fileReader.readBytes(4).readUInt32LE(0);
		const unkZero3 = fileReader.readBytes(4).readUInt32LE(0);

		brtJson["assetLookupCount"] = assetLookupCount;
		brtJson["bundleRefCount"] = bundleRefCount;
		brtJson["assetCount"] = assetCount;
		brtJson["unkHash"] = unkHash;

		readBundleRefs(fileReader, brtJson);

		readAssets(fileReader, brtJson);

		readAssetLookups(fileReader, brtJson);

		readBundles(fileReader, brtJson);

		console.log("Enter a path to save the JSON file, or nothing to use the same path as the BRT file: ");
		let savePath = prompt().trim();

		if(savePath === "")
		{
			// Trim the extension if it exists
			if(path.endsWith(".res"))
			{
				savePath = path.substring(0, path.length - 4);
			}

			savePath += ".json";
		}

		fs.writeFileSync(savePath, JSON.stringify(brtJson, null, 4));

		console.log(`BRT resource converted to JSON and saved to ${savePath}.`);
	}

	function getBrtFormat()
	{
		console.log("\nSupported Games: ");
		Object.keys(GAME_FORMATS).forEach((game, index) => {
			console.log(`${index}: ${game}`);
		});

		console.log("\nEnter the number of the game you'd like to select: ");
		let gameIndex;
		do
		{
			gameIndex = parseInt(prompt().trim());
			
			if(gameIndex < 0 || gameIndex >= Object.keys(GAME_FORMATS).length || Number.isNaN(gameIndex))
			{
				console.log("Invalid selection. Please try again.");
			}
		}
		while(gameIndex < 0 || gameIndex >= Object.keys(GAME_FORMATS).length || Number.isNaN(gameIndex));

		return GAME_FORMATS[Object.keys(GAME_FORMATS)[gameIndex]];
	}

	function writeStringTable(brtJson, stringOffsetMap)
	{
		let stringTableBuffer = Buffer.alloc(0);
		// Maintain list of strings to write
		const stringList = [];

		// Add all needed strings to the list
		stringList.push(brtJson.brtName);
		stringList.push("");

		brtJson.bundleRefs.forEach(bundleRef => {
			if(!stringList.includes(bundleRef.Name))
			{
				stringList.push(bundleRef.Name);
			}
			if(!stringList.includes(bundleRef.Directory))
			{
				stringList.push(bundleRef.Directory);
			}
		});

		brtJson.assets.forEach(asset => {
			if(!stringList.includes(asset.Name))
			{
				stringList.push(asset.Name);
			}
			if(!stringList.includes(asset.Path))
			{
				stringList.push(asset.Path);
			}
		});

		brtJson.bundles.forEach(bundle => {
			if(!stringList.includes(bundle.Name))
			{
				stringList.push(bundle.Name);
			}
		});

		// Write the string table and store the offsets in the string offset map. Strings should be null-terminated.
		stringList.forEach((string, index) => {
			const stringBuffer = Buffer.from(string + "\0", 'utf8');
			stringOffsetMap[string] = BigInt(stringTableBuffer.length + BRT_HEADER_SIZE);
			stringTableBuffer = Buffer.concat([stringTableBuffer, stringBuffer]);
		});

		return stringTableBuffer;
	}

	function writeBundleRefs(brtJson, stringOffsetMap, bundlesOffset)
	{
		let bundleRefsBuffer = Buffer.alloc(0);

		brtJson.bundleRefs.forEach(bundleRef => {
			const bundleRefBuffer = Buffer.alloc(BRT_BUNDLE_REF_SIZE);

			// Write the name offset
			bundleRefBuffer.writeBigUInt64LE(stringOffsetMap[bundleRef.Name], 0x0);

			// Write the directory offset
			bundleRefBuffer.writeBigUInt64LE(stringOffsetMap[bundleRef.Directory], 0x8);

			// Convert the bundle index to a pointer
			const bundleIndex = bundleRef.BundleIndex;
			const bundlePtr = bundlesOffset + BigInt(bundleIndex * BRT_BUNDLE_SIZE);

			// Write the bundle pointer
			bundleRefBuffer.writeBigUInt64LE(bundlePtr, 0x10);

			bundleRefsBuffer = Buffer.concat([bundleRefsBuffer, bundleRefBuffer]);
		});

		return bundleRefsBuffer;
	}

	function writeAssets(brtJson, stringOffsetMap)
	{
		let assetsBuffer = Buffer.alloc(0);

		brtJson.assets.forEach(asset => {
			const assetBuffer = Buffer.alloc(BRT_ASSET_SIZE);

			// Write the name offset
			assetBuffer.writeBigUInt64LE(stringOffsetMap[asset.Name], 0x0);

			// Write the path offset
			assetBuffer.writeBigUInt64LE(stringOffsetMap[asset.Path], 0x8);

			assetsBuffer = Buffer.concat([assetsBuffer, assetBuffer]);
		});

		return assetsBuffer;
	}

	function writeAssetLookups(brtJson)
	{
		let assetLookupsBuffer = Buffer.alloc(0);

		// Sort the asset lookups in ascending hash order (treat the hash as an unsigned long, in little endian format)
		brtJson.assetLookups.sort((a, b) => {
			const hashA = BigInt(a.Hash);
			const hashB = BigInt(b.Hash);
			return hashA < hashB ? -1 : (hashA > hashB ? 1 : 0);
		});

		brtJson.assetLookups.forEach(assetLookup => {
			const assetLookupBuffer = Buffer.alloc(BRT_ASSET_LOOKUP_SIZE);

			// Write the hash
			const hash = BigInt("0x" + assetLookup.HexHash);
			assetLookupBuffer.writeBigUInt64BE(hash, 0x0); // BE because the bytes are already in LE, so writing it LE would reverse it

			// Write the bundle ref index
			assetLookupBuffer.writeUInt32LE(assetLookup.BundleRefIndex, 0x8);

			// Write the asset index
			assetLookupBuffer.writeUInt32LE(assetLookup.AssetIndex, 0xC);

			assetLookupsBuffer = Buffer.concat([assetLookupsBuffer, assetLookupBuffer]);
		});

		return assetLookupsBuffer;
	}

	function writeBundles(brtJson, stringOffsetMap, bundlesOffset)
	{
		let bundlesBuffer = Buffer.alloc(0);

		brtJson.bundles.forEach(bundle => {
			const bundleBuffer = Buffer.alloc(BRT_BUNDLE_SIZE);

			// Write the name offset
			bundleBuffer.writeBigUInt64LE(stringOffsetMap[bundle.Name], 0x0);

			// Convert the parent bundle index to a pointer
			const parentBundleIndex = bundle.ParentBundleIndex;
			const parentBundlePtr = bundlesOffset + BigInt(parentBundleIndex * BRT_BUNDLE_SIZE);

			// Write the parent bundle pointer
			bundleBuffer.writeBigUInt64LE(parentBundlePtr, 0x8);

			bundlesBuffer = Buffer.concat([bundlesBuffer, bundleBuffer]);
		});

		return bundlesBuffer;
	}

	function writeRelocTable(brtJson, bundleRefsPtr, assetsPtr, bundlesPtr)
	{
		const pointerLocations = [0x00, 0x08, 0x10, 0x18, 0x20, 0x28];

		for(let i = 0; i < brtJson.bundleRefCount; i++)
		{
			// Write the pointer to every pointer in bundle refs
			pointerLocations.push(bundleRefsPtr + BigInt(i * BRT_BUNDLE_REF_SIZE)); // Name
			pointerLocations.push(bundleRefsPtr + BigInt(i * BRT_BUNDLE_REF_SIZE) + BigInt(0x8)); // Directory
			pointerLocations.push(bundleRefsPtr + BigInt(i * BRT_BUNDLE_REF_SIZE) + BigInt(0x10)); // Bundle
		}

		for(let i = 0; i < brtJson.assetCount; i++)
		{
			// Write the pointer to every pointer in assets
			pointerLocations.push(assetsPtr + BigInt(i * BRT_ASSET_SIZE)); // Name
			pointerLocations.push(assetsPtr + BigInt(i * BRT_ASSET_SIZE) + BigInt(0x8)); // Path
		}

		for(let i = 0; i < brtJson.bundles.length; i++)
		{
			// Write the pointer to every pointer in bundles
			pointerLocations.push(bundlesPtr + BigInt(i * BRT_BUNDLE_SIZE)); // Name
			pointerLocations.push(bundlesPtr + BigInt(i * BRT_BUNDLE_SIZE) + BigInt(0x8)); // Parent bundle
		}

		// Convert all BigInts to UInt32s
		pointerLocations.forEach((location, index) => {
			pointerLocations[index] = Number(location);
		});

		const relocTableBuffer = Buffer.alloc(4 * pointerLocations.length);

		pointerLocations.forEach((location, index) => {
			relocTableBuffer.writeUInt32LE(location, index * 4);
		});

		return relocTableBuffer;

	}

	// Function to convert JSON to BRT resource
	function convertJsonToBrt()
	{
		// Get the path of the JSON file
		let path = prompt("Enter the path to the JSON file: ").trim();

		// Check if the file exists
		if(!fs.existsSync(path))
		{
			console.log("File does not exist. Please enter a valid path.");
			return;
		}

		// Read the JSON file
		const brtJson = JSON.parse(fs.readFileSync(path, 'utf8'));

		// Get the BRT format from the file if present, otherwise ask the user
		const brtFormat = brtJson.hasOwnProperty("brtFormat") ? brtJson.brtFormat : getBrtFormat();

		if(unsupportedFormats.includes(brtFormat))
		{
			console.log("Unsupported BRT format. Aborting.");
			return;
		}

		// Set the correct header size based on the format
		BRT_HEADER_SIZE = brtFormat === BRT_FORMATS.BRT_GUID ? 0x70 : 0x50;

		// Create a new header buffer
		const headerBuffer = Buffer.alloc(0x10);

		// Create a new BRT header buffer
		const brtHeaderBuffer = Buffer.alloc(BRT_HEADER_SIZE);


		if(brtFormat === BRT_FORMATS.BRT_GUID)
		{
			// Read the GUID string and convert it to a buffer
			const brtInstanceGuid = utilFunctions.writeGUID(brtJson.brtInstanceGuid);
			brtInstanceGuid.copy(brtHeaderBuffer, 0x30);
		}

		// Write the asset lookup count, bundle ref count, and asset count
		brtHeaderBuffer.writeUInt32LE(brtJson.assetLookupCount, BRT_HEADER_SIZE - 0x20);
		brtHeaderBuffer.writeUInt32LE(brtJson.bundleRefCount, BRT_HEADER_SIZE - 0x1C);
		brtHeaderBuffer.writeUInt32LE(brtJson.assetCount, BRT_HEADER_SIZE - 0x18);

		// Write the unknown hash
		brtHeaderBuffer.writeUInt32LE(brtJson.unkHash, BRT_HEADER_SIZE - 0x10);

		// Write the unknown 1 
		brtHeaderBuffer.writeUInt32LE(1, BRT_HEADER_SIZE - 0x08);

		// Call function to write the string table and store string offset object
		let stringOffsetMap = {};
		let stringTableBuffer = writeStringTable(brtJson, stringOffsetMap);

		// Write the table name offset at the beginning of the BRT header
		brtHeaderBuffer.writeBigUInt64LE(stringOffsetMap[brtJson.brtName], 0x0);

		// Pad the string table to the nearest 0x10 bytes
		const stringTablePad = 16 - (stringTableBuffer.length % 0x10);
		const padBuffer = Buffer.alloc(stringTablePad);
		stringTableBuffer = Buffer.concat([stringTableBuffer, padBuffer]);

		// Now that we know the size of the string table, we can calculate all the other header offsets and the reloc table size
		const bundleRefsPtr = BigInt(BRT_HEADER_SIZE + stringTableBuffer.length);
		const assetsPtr = bundleRefsPtr + BigInt(BRT_BUNDLE_REF_SIZE * brtJson.bundleRefCount);
		const assetLookupsPtr = assetsPtr + BigInt(BRT_ASSET_SIZE * brtJson.assetCount);
		const bundlesPtr = assetLookupsPtr + BigInt(BRT_ASSET_LOOKUP_SIZE * brtJson.assetLookupCount);
		const emptyStringPtr = stringOffsetMap[""];

		const relocTableSize = 4 * ((2 * brtJson.bundles.length) + (3 * brtJson.bundleRefCount) + (2 * brtJson.assetCount) + 6);

		// Write the various pointers and sizes to their correct buffers and locations
		headerBuffer.writeUInt32LE(relocTableSize, 0x4);
		brtHeaderBuffer.writeBigUInt64LE(assetLookupsPtr, 0x08);
		brtHeaderBuffer.writeBigUInt64LE(bundleRefsPtr, 0x10);
		brtHeaderBuffer.writeBigUInt64LE(assetsPtr, 0x18);
		brtHeaderBuffer.writeBigUInt64LE(bundlesPtr, 0x20);
		brtHeaderBuffer.writeBigUInt64LE(emptyStringPtr, 0x28);

		// Write the bundlerefs section
		let bundleRefsBuffer = writeBundleRefs(brtJson, stringOffsetMap, bundlesPtr);

		// Write the assets section
		let assetsBuffer = writeAssets(brtJson, stringOffsetMap);

		// Write the asset lookups section
		let assetLookupsBuffer = writeAssetLookups(brtJson);

		// Write the bundles section
		let bundlesBuffer = writeBundles(brtJson, stringOffsetMap, bundlesPtr);

		// We can now write the BRT section length to the header
		let brtSectionLength = BRT_HEADER_SIZE + stringTableBuffer.length + bundleRefsBuffer.length + assetsBuffer.length + assetLookupsBuffer.length + bundlesBuffer.length;
		headerBuffer.writeUInt32LE(brtSectionLength, 0x0);

		// Write the reloc table
		const relocTableBuffer = writeRelocTable(brtJson, bundleRefsPtr, assetsPtr, bundlesPtr);


		const finalBrtBuffer = Buffer.concat([headerBuffer, brtHeaderBuffer, stringTableBuffer, bundleRefsBuffer, assetsBuffer, assetLookupsBuffer, bundlesBuffer, relocTableBuffer]);

		console.log("Enter a path to save the BRT file, or nothing to use the same path as the JSON file: ");
		let savePath = prompt().trim();

		if(savePath === "")
		{
			// Trim the extension if it exists
			if(path.endsWith(".json"))
			{
				savePath = path.substring(0, path.length - 5);
			}

			savePath += ".res";
		}

		fs.writeFileSync(savePath, finalBrtBuffer);

		console.log(`JSON converted to BRT resource and saved to ${savePath}.`);

	}

	const options = ["Convert BRT resource to JSON", "Convert JSON to BRT resource", "Import duplication spreadsheet into BRT JSON", "Exit program"]; 

	// Main program logic
	console.log(`Welcome to BRT Tools ${VERSION_STRING}! This program will help you convert BundleRefTable files.\n`);
	
	do
	{
		console.log("MAIN MENU:")
		options.forEach((option, index) => {
			console.log(`${index + 1}. ${option}`);
		});

		console.log("\nEnter the number of the option you'd like to select: ");

		let option = parseInt(prompt().trim());

		if(option < 1 || option > options.length || Number.isNaN(option))
		{
			console.log("Invalid option. Please enter a valid option.");
			continue;
		}

		if(option === 1)
		{
			await convertBrtToJson();
		}
		else if(option === 2)
		{
			await convertJsonToBrt();
		}
		else if(option === 3)
		{
			brtManager.importDuplicationSheet();
		}
		else if(option === 4)
		{
			break;
		}

		console.log("\n");

	}
	while(true);

	

})();