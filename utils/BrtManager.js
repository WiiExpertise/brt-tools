const utilFunctions = require('./UtilFunctions');
const fs = require('fs');
const prompt = require('prompt-sync')();
const xlsx = require('xlsx');

function importDuplicationSheet()
{
    console.log("Enter the path to the BRT JSON file:");
    const filePath = prompt().trim();

    if(!fs.existsSync(filePath))
    {
        console.log("File does not exist. Please enter a valid path.");
        return;
    }

    const brtData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    console.log("Enter the path to the duplication xlsx sheet:");
    const duplicationSheetPath = prompt().trim();

    if(!fs.existsSync(duplicationSheetPath))
    {
        console.log("File does not exist. Please enter a valid path.");
        return;
    }

    const workbook = xlsx.readFile(duplicationSheetPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    importItems(brtData, data);

    // Save the modified BRT data back to the file
    console.log("Enter the path to save the modified BRT JSON file or nothing to overwrite the original file:");
    const savePath = prompt().trim();

    if(savePath === "")
    {
        fs.writeFileSync(filePath, JSON.stringify(brtData, null, 2), 'utf8');
        console.log(`BRT data saved to ${filePath}.`);
    }
    else
    {
        fs.writeFileSync(savePath, JSON.stringify(brtData, null, 2), 'utf8');
        console.log(`BRT data saved to ${savePath}.`);
    }
}

function importItems(brtData, data)
{
    for(let i = 0; i < data.length; i++)
    {
        const item = data[i];
        const origPath = item['Original'];
        const dupePath = item['Dupe'];

        // Split the original path to get the file name
        const origPathParts = origPath.split('/');
        const origFileName = origPathParts[origPathParts.length - 1];

        const origFileNameHash = utilFunctions.fnv64HashString(origFileName, 'kCharCaseLower');
        const origHash = utilFunctions.fnv64HashString(origPath, 'kCharCaseLower');
        const dupePathHash = utilFunctions.fnv64HashString(dupePath, 'kCharCaseLower');

        // Split the dupe path to get the file name
        const dupePathParts = dupePath.split('/');
        const dupeFileName = dupePathParts[dupePathParts.length - 1];
        const dupeFileNameHash = utilFunctions.fnv64HashString(dupeFileName, 'kCharCaseLower');
        // Convert the two dupe hashes to little endian hex strings
        const dupePathHashHex = BigInt(dupePathHash).toString(16).padStart(16, '0').match(/.{1,2}/g).reverse().join('');
        const dupeFileNameHashHex = BigInt(dupeFileNameHash).toString(16).padStart(16, '0').match(/.{1,2}/g).reverse().join('');

        // Get the original hash hex string
        const origHashHex = BigInt(origHash).toString(16).padStart(16, '0').match(/.{1,2}/g).reverse().join('');
        const origFileNameHashHex = BigInt(origFileNameHash).toString(16).padStart(16, '0').match(/.{1,2}/g).reverse().join('');

        // Find the asset lookup entry with the orig hash
        const origAssetLookup = brtData.assetLookups.find(entry => entry.Hash === origHash.toString() || entry.Hash === origFileNameHash.toString());
        if(!origAssetLookup)
        {
            console.log(`Original asset lookup not found for hash: ${origHash}. Skipping.`);
            continue;
        }

        const bundleRefIndex = origAssetLookup.BundleRefIndex;

        const dupePathOnly = dupePathParts.slice(0, dupePathParts.length - 1).join('/');

        const newAssetEntry = {
            "Name": dupeFileName.toLowerCase(),
            "Path": dupePathOnly.toLowerCase()
        };


        if(brtData.brtFormat < 2)
        {
            brtData.assets.push(newAssetEntry);
        }
        const newAssetIndex = brtData.brtFormat < 2 ? brtData.assets.length - 1 : -1;

        const newAssetLookupEntry1 = brtData.brtFormat < 2 ? {
            "Hash": dupePathHash.toString(10),
            "HexHash": dupePathHashHex,
            "BundleRefIndex": bundleRefIndex,
            "AssetIndex": newAssetIndex,
        } : {
            "Hash": dupePathHash.toString(10),
            "HexHash": dupePathHashHex,
            "BundleRefIndex": bundleRefIndex,
            "AssetPath": dupePath.toLowerCase(),
        };

        const newAssetLookupEntry2 = brtData.brtFormat < 2 ? {
            "Hash": dupeFileNameHash.toString(10),
            "HexHash": dupeFileNameHashHex,
            "BundleRefIndex": bundleRefIndex,
            "AssetIndex": newAssetIndex,
        } : {
            "Hash": dupeFileNameHash.toString(10),
            "HexHash": dupeFileNameHashHex,
            "BundleRefIndex": bundleRefIndex,
            "AssetPath": dupeFileName.toLowerCase(),
        };

        // Add the new asset lookup entries to the asset lookups array
        brtData.assetLookups.push(newAssetLookupEntry1);
        brtData.assetLookups.push(newAssetLookupEntry2);

        if(brtData.brtFormat < 2)
        {
            brtData.assetCount++;
        }
        brtData.assetLookupCount += 2;


    }
}

function brtMerger()
{
    console.log("Enter the path to the first BRT JSON file (highest priority):");
    // Get path and remove quotes if any
    const brt1Path = prompt().trim().replace(/['"]/g, '');
    if(!fs.existsSync(brt1Path))
    {
        console.log("File does not exist. Please enter a valid path.");
        return;
    }

    console.log("Enter the path to the second BRT JSON file (lower priority):");
    const brt2Path = prompt().trim().replace(/['"]/g, '');
    if(!fs.existsSync(brt2Path))
    {
        console.log("File does not exist. Please enter a valid path.");
        return;
    }

    const brt1 = JSON.parse(fs.readFileSync(brt1Path, 'utf8'));
    const brt2 = JSON.parse(fs.readFileSync(brt2Path, 'utf8'));

    if(brt1.brtName !== brt2.brtName)
    {
        console.log("These are not the same kind of BRT. Cannot merge.");
        return;
    }

    if(brt1.brtFormat !== brt2.brtFormat)
    {
        console.log("These are not from the same game. Cannot merge.");
        return;
    }


    const mergedBrt = mergeBrts(brt1, brt2);
    console.log("Enter the path to save the merged BRT JSON file:");
    const savePath = prompt().trim().replace(/['"]/g, '');
    fs.writeFileSync(savePath, JSON.stringify(mergedBrt, null, 4), 'utf8');

    console.log(`Merged BRT JSON saved to ${savePath}.`);
}

function mergeBrts(brt1, brt2)
{
    for(let i = 0; i < brt2.assetLookups.length; i++)
    {
        const assetLookup = brt2.assetLookups[i];
        const existingAssetLookup = brt1.assetLookups.find(entry => entry.Hash === assetLookup.Hash);
        if(existingAssetLookup)
        {
            // If BRT 1 already has a lookup for this hash, skip it
            continue;
        }

        const newAssetLookup = brt1.brtFormat < 2 ? {
            Hash: assetLookup.Hash,
            HexHash: assetLookup.HexHash,
            BundleRefIndex: -1, // Placeholder for now
            AssetIndex: -1, // Placeholder for now
        } : {
            Hash: assetLookup.Hash,
            HexHash: assetLookup.HexHash,
            BundleRefIndex: -1, // Placeholder for now
            AssetPath: assetLookup.AssetPath,
        };

        const oldAsset = brt1.brtFormat < 2 ? brt2.assets[assetLookup.AssetIndex] : null;
        const oldBundleRef = brt2.bundleRefs[assetLookup.BundleRefIndex];

        const existingAsset = brt1.brtFormat < 2 ? brt1.assets.find(entry => entry.Name === oldAsset.Name && entry.Path === oldAsset.Path) : null;
        if(existingAsset)
        {
            newAssetLookup.AssetIndex = brt1.assets.indexOf(existingAsset);
        }

        const existingBundleRef = brt1.brtFormat < 2 ? brt1.bundleRefs.find(entry => entry.Name === oldBundleRef.Name && entry.Directory === oldBundleRef.Directory) : brt1.bundleRefs.find(entry => entry.Path.toLowerCase() === oldBundleRef.Path.toLowerCase());
        if(existingBundleRef)
        {
            newAssetLookup.BundleRefIndex = brt1.bundleRefs.indexOf(existingBundleRef);
        }

        if(brt1.brtFormat < 2 && newAssetLookup.AssetIndex === -1)
        {
            // If the asset doesn't exist in BRT 1, add it
            brt1.assets.push(oldAsset);
            brt1.assetCount++;
            newAssetLookup.AssetIndex = brt1.assets.length - 1;
        }

        if(newAssetLookup.BundleRefIndex === -1)
        {
            // If the bundle ref doesn't exist in BRT 1, add it
            brt1.bundleRefs.push(oldBundleRef);
            brt1.bundleRefCount++;
            newAssetLookup.BundleRefIndex = brt1.bundleRefs.length - 1;
        }
        // Add the new asset lookup to BRT 1
        brt1.assetLookups.push(newAssetLookup);
        brt1.assetLookupCount++;
    }

    return brt1;
}

module.exports = {
    importDuplicationSheet,
    brtMerger
};