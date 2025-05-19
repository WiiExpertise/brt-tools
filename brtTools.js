(async() => {
	// Required modules
	const fs = require('fs');
	const prompt = require('prompt-sync')();
	const utilFunctions = require('./utils/UtilFunctions');
	const { FileParser } = require('./utils/FileParser');
	const brtManager = require('./utils/BrtManager');

	// Version number constant
	const VERSION_STRING = "v1.2 DEV";

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

	// We currently don't support these formats (for reading and/or writing respectively)
	const unsupportedReadFormats = [
		//BRT_FORMATS.BRT_COMPRESSED_STRINGS
	];

	const unsupportedWriteFormats = [
		//BRT_FORMATS.BRT_COMPRESSED_STRINGS
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
	let stringTablePtr;
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

	function readCompressedStringBrt(path, brtJson)
	{
		// Read the file
		const resourceData = fs.readFileSync(path).subarray(0x10);
		const fileReader = new FileParser(resourceData);

		const brtNamePtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));
		const brtName = fileReader.readNullTerminatedString(brtNamePtr);

		brtJson["brtName"] = brtName;

		assetLookupsPtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));
		stringTablePtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));
		bundleRefsPtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));

		const unkStringPtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));
		const unkString = fileReader.readNullTerminatedString(unkStringPtr);

		if(unkString !== "")
		{
			console.log("Weird BRT format, expected empty string but got: " + unkString);
		}

		const brtInstanceGuid = utilFunctions.readGUID(fileReader.readBytes(16));
		brtJson["brtInstanceGuid"] = brtInstanceGuid;
		fileReader.readBytes(16); // Skip 16 bytes

		const assetLookupCount = fileReader.readBytes(4).readUInt32LE(0);
		const bundleRefCount = fileReader.readBytes(4).readUInt32LE(0);
		const stringCount = fileReader.readBytes(4).readUInt32LE(0);

		const unkZero1 = fileReader.readBytes(4).readUInt32LE(0);

		const unkHash = fileReader.readBytes(4).readUInt32LE(0);

		const unkZero2 = fileReader.readBytes(4).readUInt32LE(0);
		const unkOne = fileReader.readBytes(4).readUInt32LE(0);
		const unkZero3 = fileReader.readBytes(4).readUInt32LE(0);

		brtJson["assetLookupCount"] = assetLookupCount;
		brtJson["bundleRefCount"] = bundleRefCount;
		brtJson["stringCount"] = stringCount;
		brtJson["unkHash"] = unkHash;

		const stringMap = {};

		readNewBundleRefs(fileReader, brtJson, stringMap);

		//console.log(stringMap);

		readNewAssetLookups(fileReader, brtJson, stringMap);

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

	function readNewAssetLookups(fileReader, brtJson, stringMap)
	{
		fileReader.offset = assetLookupsPtr;

		const assetLookups = [];

		for(let i = 0; i < brtJson.assetLookupCount; i++)
		{
			//console.log("Reading asset lookup " + i + " at offset " + fileReader.offset.toString(16));
			
			const assetLookup = {};

			const rawHash = fileReader.readBytes(8);
			const hash = BigInt(rawHash.readBigUInt64LE(0));

			// Convert rawHash to hex string
			const hexHash = rawHash.toString('hex');
			const bundleRefIndex = fileReader.readBytes(4).readUInt32LE(0);
			
			const pathStringRefInfo = readStringRef(fileReader);
			let assetPath;
			if(pathStringRefInfo.stringOffset === -1)
			{
				assetPath = "";
			}
			else
			{
				assetPath = readCompressedString(fileReader, pathStringRefInfo, stringMap);
			}

			assetLookup["Hash"] = hash.toString();
			assetLookup["HexHash"] = hexHash;
			assetLookup["BundleRefIndex"] = bundleRefIndex;
			assetLookup["AssetPath"] = assetPath;

			assetLookups.push(assetLookup);
		}

		brtJson["assetLookups"] = assetLookups;
	}

	function readNewBundleRefs(fileReader, brtJson, stringMap)
	{
		fileReader.offset = bundleRefsPtr;

		const bundleRefs = [];

		for(let i = 0; i < brtJson.bundleRefCount; i++)
		{
			//console.log("Reading bundle ref " + i + " at offset " + fileReader.offset.toString(16));
			
			const bundleRef = {};

			const pathStringRefInfo = readStringRef(fileReader);
			const parentBundleIndex = fileReader.readBytes(4).readInt32LE(0);

			let path;

			if(pathStringRefInfo.stringOffset === -1)
			{
				path = "";
			}
			else
			{
				path = readCompressedString(fileReader, pathStringRefInfo, stringMap);
			}
			
			bundleRef.Path = path;
			bundleRef.ParentBundleIndex = parentBundleIndex;

			bundleRefs.push(bundleRef);
		}

		brtJson["bundleRefs"] = bundleRefs;
	}

	function readStringRef(fileReader, signed = true)
	{
		const stringOffset = fileReader.readBytes(2).readInt16LE(0);
		const identifier = fileReader.readBytes(1).readUInt8(0);
		const length = fileReader.readBytes(1).readUInt8(0);

		const stringReFInfo = {};
		stringReFInfo["stringOffset"] = stringOffset;
		stringReFInfo["identifier"] = identifier;
		stringReFInfo["strLength"] = length;

		return stringReFInfo;
	}

	function readCompressedString(fileReader, stringRefInfo, stringMap)
	{
		const origOffset = fileReader.offset;

		const stringAddress = stringTablePtr + stringRefInfo.stringOffset;

		fileReader.offset = stringAddress;

		const baseStringRef = readStringRef(fileReader, true);

		let currString;

		console.log("Identifier " + stringRefInfo.identifier.toString(16) + " for string at offset " + fileReader.offset.toString(16));

		if(stringRefInfo.identifier === 128 || stringRefInfo.identifier - 1 === 128)
		{
			console.log("Reading at offset " + fileReader.offset.toString(16));
			currString = fileReader.readSizedString(stringRefInfo.strLength);
		}
		else if(stringRefInfo.identifier === 0 || stringRefInfo.identifier - 1 === 0)
		{
			console.log("StringRef identifier is 0 reading string at offset " + stringAddress.toString(16) + " current offset " + fileReader.offset.toString(16));
			const additionalOffset = fileReader.readBytes(4).readUInt32LE(0);
			fileReader.offset = stringTablePtr + additionalOffset;
			console.log("Reading at offset " + fileReader.offset.toString(16));
			currString = fileReader.readSizedString(stringRefInfo.strLength);
		}
		else
		{
			console.log("Reading at offset " + fileReader.offset.toString(16));
			currString = fileReader.readSizedString(stringRefInfo.strLength);
		}

		//console.log(baseStringRef);

		if(baseStringRef.stringOffset !== -1)
		{
			fileReader.offset = stringTablePtr + baseStringRef.stringOffset + 4; // Skip the previous base string ref

			let baseString = "";
			if(baseStringRef.identifier === 0 || baseStringRef.identifier - 1 === 0)
			{
				fileReader.offset = stringTablePtr + fileReader.readBytes(4).readUInt32LE(0);
				baseString = fileReader.readSizedString(baseStringRef.strLength);
			}
			else
			{
				baseString = fileReader.readSizedString(baseStringRef.strLength);
			}
			//console.log("Base string: " + baseString + " at offset " + fileReader.offset.toString(16));
			
			const baseFinalString = readCompressedString(fileReader, baseStringRef, stringMap);
			console.log("Base string: " + baseString);
			console.log("Base final string: " + baseFinalString);
			console.log("Current string: " + currString);
			console.log("Base string ref length: " + baseStringRef.strLength);

			// Find where baseString occurs in baseFinalString
			let baseStringIndex = baseFinalString.lastIndexOf(baseString);

			if(baseStringIndex === -1)
			{
				//console.log("Base string: " + baseString);
				//console.log("Base final string: " + baseFinalString);
				//console.log("Base string ref length: " + baseStringRef.strLength);
			}

			if(baseString === "")
			{
				//console.log("Base string is empty at offset " + fileReader.offset.toString(16));
			}

			console.log("new components:");
			console.log(baseFinalString.substring(0, baseStringIndex));
			console.log(baseString.substring(0, baseStringRef.strLength));
			console.log(currString);

			// Take everything before baseString from baseFinalString, then take baseStringRef.length from baseString
			currString = baseFinalString.substring(0, baseStringIndex) + baseString.substring(0, baseStringRef.strLength) + currString;

			console.log("Final string: " + currString);
		}

		stringMap[stringAddress] = currString;
		fileReader.offset = origOffset;

		//console.log(stringMap);

		return currString;
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

		if(unsupportedReadFormats.includes(brtFormat))
		{
			console.log("Unsupported BRT format. Aborting.");
			return;
		}

		if(brtFormat === BRT_FORMATS.BRT_COMPRESSED_STRINGS)
		{
			brtJson["brtFormat"] = brtFormat;
			readCompressedStringBrt(path, brtJson);
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

	function writeCompressedStringBrt(brtJson)
	{
		const COMPRESSED_STRING_HEADER_SIZE = 0x70;
		
		let brtBuf = Buffer.alloc(0);

		// Create a new header buffer
		const headerBuffer = Buffer.alloc(0x10);

		// Create a new BRT header buffer
		let brtHeaderBuffer = Buffer.alloc(COMPRESSED_STRING_HEADER_SIZE);

		// Name offset is always right after the header
		const nameOffset = COMPRESSED_STRING_HEADER_SIZE;
		const emptyStringOffset = nameOffset + brtJson.brtName.length + 1;
		brtHeaderBuffer.writeBigUInt64LE(BigInt(nameOffset), 0x0);
		brtHeaderBuffer.writeBigUInt64LE(BigInt(emptyStringOffset), 0x20);

		// Create a new buffer with the BRT name null-terminated plus an extra empty string
		const brtNameBuffer = Buffer.from(brtJson.brtName + "\0" + "\0", 'utf8');

		const headerPadBuf = Buffer.alloc(0x10 - (brtNameBuffer.length % 0x10));

		const brtNameWithPad = Buffer.concat([brtNameBuffer, headerPadBuf]);

		// String table comes after the header and name sections
		const stringTableOffset = COMPRESSED_STRING_HEADER_SIZE + brtNameWithPad.length;
		brtHeaderBuffer.writeUInt32LE(stringTableOffset, 0x10);

		const stringMap = enumerateCompressedStrings(brtJson);

		const stringCount = Object.keys(stringMap).length;

		const stringTableBuffer = writeCompressedStringTable(stringMap);

		// Write counts
		brtHeaderBuffer.writeUInt32LE(brtJson.assetLookups.length, 0x48);
		brtHeaderBuffer.writeUInt32LE(brtJson.bundleRefs.length, 0x4C);
		brtHeaderBuffer.writeUInt32LE(stringCount, 0x50);

		// Write unknown hash
		brtHeaderBuffer.writeUInt32LE(brtJson.unkHash, 0x58);

		// Write unknown 1
		brtHeaderBuffer.writeUInt32LE(1, 0x60);


		// Write the GUID
		const brtInstanceGuid = utilFunctions.writeGUID(brtJson.brtInstanceGuid);
		brtInstanceGuid.copy(brtHeaderBuffer, 0x28);

		brtHeaderBuffer = Buffer.concat([brtHeaderBuffer, brtNameWithPad]);

		const bundleRefsBuffer = writeNewBundleRefs(brtJson, stringMap);
		const assetLookupsBuffer = writeNewAssetLookups(brtJson, stringMap);

		const pointerLocations = [0x00, 0x08, 0x10, 0x18, 0x20];

		const relocTableBuffer = Buffer.alloc(4 * pointerLocations.length);
		for(let i = 0; i < pointerLocations.length; i++)
		{
			relocTableBuffer.writeUInt32LE(pointerLocations[i], i * 4);
		}

		brtHeaderBuffer = Buffer.concat([brtHeaderBuffer, stringTableBuffer]);

		const bundleRefsOffset = brtHeaderBuffer.length;

		brtHeaderBuffer = Buffer.concat([brtHeaderBuffer, bundleRefsBuffer]);

		const assetLookupsOffset = brtHeaderBuffer.length;

		brtHeaderBuffer = Buffer.concat([brtHeaderBuffer, assetLookupsBuffer]);

		const relocTableOffset = brtHeaderBuffer.length;

		brtHeaderBuffer = Buffer.concat([brtHeaderBuffer, relocTableBuffer]);

		brtHeaderBuffer.writeBigUInt64LE(BigInt(assetLookupsOffset), 0x8);
		brtHeaderBuffer.writeBigUInt64LE(BigInt(bundleRefsOffset), 0x18);

		headerBuffer.writeUInt32LE(relocTableOffset, 0x0);
		headerBuffer.writeUInt32LE(relocTableBuffer.length, 0x4);

		brtBuf = Buffer.concat([headerBuffer, brtHeaderBuffer]);

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

		fs.writeFileSync(savePath, brtBuf);

		console.log(`JSON converted to BRT resource and saved to ${savePath}.`);

	}

	function writeNewBundleRefs(brtJson, stringMap)
	{
		let bundleRefsBuffer = Buffer.alloc(0);

		brtJson.bundleRefs.forEach(bundleRef => {
			const bundleRefBuffer = Buffer.alloc(8);

			if(bundleRef.Path === "")
			{
				bundleRefBuffer.writeUInt32LE(0xFFFFFFFF, 0x0);
				bundleRefBuffer.writeUInt32LE(0xFFFFFFFF, 0x4);
			}
			else
			{
				bundleRefBuffer.writeInt16LE(stringMap[bundleRef.Path.toLowerCase()]);
				bundleRefBuffer.writeUInt8(0x80, 0x2);
				bundleRefBuffer.writeUInt8(bundleRef.Path.length, 0x3);

				bundleRefBuffer.writeInt32LE(bundleRef.ParentBundleIndex, 0x4);
			}

			bundleRefsBuffer = Buffer.concat([bundleRefsBuffer, bundleRefBuffer]);
		});

		// Pad the bundle refs to the nearest 0x10 bytes
		const bundleRefsPad = 16 - (bundleRefsBuffer.length % 0x10);
		const padBuffer = Buffer.alloc(bundleRefsPad);
		bundleRefsBuffer = Buffer.concat([bundleRefsBuffer, padBuffer]);

		return bundleRefsBuffer;
	}

	function writeNewAssetLookups(brtJson, stringMap)
	{
		let assetLookupsBuffer = Buffer.alloc(0);

		// Sort the asset lookups in ascending hash order (treat the hash as an unsigned long, in little endian format)
		brtJson.assetLookups.sort((a, b) => {
			const hashA = BigInt(a.Hash);
			const hashB = BigInt(b.Hash);
			return hashA < hashB ? -1 : (hashA > hashB ? 1 : 0);
		});

		brtJson.assetLookups.forEach(assetLookup => {
			const assetLookupBuffer = Buffer.alloc(0x20);

			// Write the hash
			const hash = BigInt("0x" + assetLookup.HexHash);
			assetLookupBuffer.writeBigUInt64BE(hash, 0x0); // BE because the bytes are already in LE, so writing it LE would reverse it

			assetLookupBuffer.writeInt32LE(assetLookup.BundleRefIndex, 0x8);

			assetLookupBuffer.writeInt16LE(stringMap[assetLookup.AssetPath.toLowerCase()], 0xC);
			assetLookupBuffer.writeUInt8(0x80, 0xE);
			assetLookupBuffer.writeUInt8(assetLookup.AssetPath.length, 0xF);

			assetLookupsBuffer = Buffer.concat([assetLookupsBuffer, assetLookupBuffer]);
		});

		// Pad the asset lookups to the nearest 0x10 bytes
		const assetLookupsPad = 16 - (assetLookupsBuffer.length % 0x10);
		const padBuffer = Buffer.alloc(assetLookupsPad);
		assetLookupsBuffer = Buffer.concat([assetLookupsBuffer, padBuffer]);

		return assetLookupsBuffer;
	}

	function enumerateCompressedStrings(brtJson)
	{
		const stringMap = {};

		brtJson.bundleRefs.forEach(bundleRef => {
			if(bundleRef.Path === "")
			{
				return;
			}
			
			if(!stringMap.hasOwnProperty(bundleRef.Path.toLowerCase()))
			{
				stringMap[bundleRef.Path.toLowerCase()] = 0;
			}
		});

		brtJson.assetLookups.forEach(asset => {
			if(!stringMap.hasOwnProperty(asset.AssetPath.toLowerCase()))
			{
				stringMap[asset.AssetPath.toLowerCase()] = 0;
			}
		});

		return stringMap;
	}

	// Function to write the string table
	function writeCompressedStringTable(stringMap)
	{
		// To save effort, we will just write all complete strings without compression, maintaining format.
		let stringTableBuffer = Buffer.alloc(0);
		const stringList = Object.keys(stringMap);
		stringList.forEach(string => {
			// If the string length is greater than 127, we need to split it into multiple substrings of no more than 127 bytes and then refer all but the first part to the previous part
			if(string.length > 127)
			{
				const parts = string.match(/.{1,127}/g);
				parts.forEach((part, index) => {
					if(index === 0)
					{
						stringMap[part] = stringTableBuffer.length;

						// No base string, so write the base string ref as 0xFFFFFFFF
						const baseStringRefBuffer = Buffer.alloc(4);
						baseStringRefBuffer.writeUInt32LE(0xFFFFFFFF, 0x0);
						const partBuffer = Buffer.from(part, 'utf8');
						stringTableBuffer = Buffer.concat([stringTableBuffer, baseStringRefBuffer, partBuffer]);
					}
					else
					{
						stringMap[part] = stringTableBuffer.length;
						const baseStringRefBuffer = Buffer.alloc(4);
						baseStringRefBuffer.writeUInt16LE(stringMap[parts[index - 1]], 0x0);
						baseStringRefBuffer.writeUInt8(0x80, 0x2);
						baseStringRefBuffer.writeUInt8(parts[index - 1].length, 0x3);

						const partBuffer = Buffer.from(part, 'utf8');
						stringTableBuffer = Buffer.concat([stringTableBuffer, baseStringRefBuffer, partBuffer]);
					}
				});

				// For convenience when writing other sections later, set the offset of the complete string in the string map to the offset of the last part
				stringMap[string] = stringMap[parts[parts.length - 1]];

				return;
			}
			
			stringMap[string] = stringTableBuffer.length;

			// No base string, so write the base string ref as 0xFFFFFFFF
			const baseStringRefBuffer = Buffer.alloc(4);
			baseStringRefBuffer.writeUInt32LE(0xFFFFFFFF, 0x0);

			const stringBuffer = Buffer.from(string, 'utf8');
			stringTableBuffer = Buffer.concat([stringTableBuffer, baseStringRefBuffer, stringBuffer]);
		});

		// Pad the string table to the nearest 0x10 bytes
		const stringTablePad = 16 - (stringTableBuffer.length % 0x10);

		const padBuffer = Buffer.alloc(stringTablePad);
		stringTableBuffer = Buffer.concat([stringTableBuffer, padBuffer]);

		return stringTableBuffer;
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

		if(unsupportedWriteFormats.includes(brtFormat))
		{
			console.log("Unsupported BRT format. Aborting.");
			return;
		}

		if(brtFormat === BRT_FORMATS.BRT_COMPRESSED_STRINGS)
		{
			writeCompressedStringBrt(brtJson);
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

	const options = ["Convert BRT resource to JSON", "Convert JSON to BRT resource", "Import duplication spreadsheet into BRT JSON", "Merge two BRT JSON files", "Exit program"]; 

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
			brtManager.brtMerger();
		}
		else if(option === 5)
		{
			break;
		}

		console.log("\n");

	}
	while(true);

	

})();