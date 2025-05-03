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

        // Find the asset lookup entry with the orig hash
        const origAssetLookup = brtData.assetLookups.find(entry => entry.Hash === origHash.toString());
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

        brtData.assets.push(newAssetEntry);
        const newAssetIndex = brtData.assets.length - 1;

        const newAssetLookupEntry1 = {
            "Hash": dupePathHash.toString(10),
            "HexHash": dupePathHashHex,
            "BundleRefIndex": bundleRefIndex,
            "AssetIndex": newAssetIndex,
        };

        const newAssetLookupEntry2 = {
            "Hash": dupeFileNameHash.toString(10),
            "HexHash": dupeFileNameHashHex,
            "BundleRefIndex": bundleRefIndex,
            "AssetIndex": newAssetIndex,
        };

        // Add the new asset lookup entries to the asset lookups array
        brtData.assetLookups.push(newAssetLookupEntry1);
        brtData.assetLookups.push(newAssetLookupEntry2);

        brtData.assetCount++;
        brtData.assetLookupCount += 2;


    }
}

module.exports = {
    importDuplicationSheet
};