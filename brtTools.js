(async() => {
	// Required modules
	const fs = require('fs');
	const prompt = require('prompt-sync')();
	const utilFunctions = require('./utils/UtilFunctions');
	const { FileParser } = require('./utils/FileParser');

	// Version number constant
	const VERSION_STRING = "vDEV";

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
			const hash = BigInt(rawHash.readBigInt64LE(0));

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

		// Read the file
		const resourceData = fs.readFileSync(path).subarray(0x10);
		const fileReader = new FileParser(resourceData);

		const brtNamePtr = parseInt(fileReader.readBytes(8).readBigUInt64LE(0));
		const brtName = fileReader.readNullTerminatedString(brtNamePtr);

		brtJson["brtName"] = brtName;

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

		const brtInstanceGuid = utilFunctions.readGUID(fileReader.readBytes(16)); // Each byte section is in reversed order, need to fix later
		brtJson["brtInstanceGuid"] = brtInstanceGuid;

		fileReader.readBytes(16); // Skip 16 bytes

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

	const options = ["Convert BRT resource to JSON", "Exit program"]; 

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
			break;
		}

		console.log("\n");

	}
	while(true);

	

})();