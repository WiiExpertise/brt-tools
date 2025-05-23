function readGUID(data) {
  // Extract and reverse each segment
  const reverseHex = (buffer, start, end) => 
      buffer.slice(start, end).toString('hex').match(/../g).reverse().join('');

  const guid = [
      reverseHex(data, 0, 4),  // Reverse first 4 bytes
      reverseHex(data, 4, 6), // Reverse next 2 bytes
      reverseHex(data, 6, 8), // Reverse next 2 bytes
      data.slice(8, 10).toString('hex'),
      data.slice(10, 16).toString('hex')
  ].join('-');

  return guid;
}

function writeGUID(guidStr)
{
    // First 3 segments of GUID should be reversed when writing, the last 2 segments are fine
    const guidSegments = guidStr.split('-');
    const guidBuffer = Buffer.alloc(16);
    
    // Reverse first 3 segments
    guidSegments[0] = guidSegments[0].match(/../g).reverse().join('');
    guidSegments[1] = guidSegments[1].match(/../g).reverse().join('');
    guidSegments[2] = guidSegments[2].match(/../g).reverse().join('');

    // Write GUID to buffer in little endian hex
    guidBuffer.write(guidSegments[0], 0, 4, 'hex');
    guidBuffer.write(guidSegments[1], 4, 2, 'hex');
    guidBuffer.write(guidSegments[2], 6, 2, 'hex');
    guidBuffer.write(guidSegments[3], 8, 2, 'hex');
    guidBuffer.write(guidSegments[4], 10, 6, 'hex');

    return guidBuffer;
}

function fnv64HashString(data, charCase = 'kCharCaseAny', initialValue = BigInt("14695981039346656037")) {
    const FNV_PRIME = BigInt("1099511628211");
    const MODULUS = BigInt("2") ** BigInt("64");
    
    let hash = BigInt(initialValue);
    
    for (let c of data) {
        let charCode;
        if (charCase === 'kCharCaseAny') {
            charCode = c.charCodeAt(0);
        } else if (charCase === 'kCharCaseLower') {
            charCode = c.toLowerCase().charCodeAt(0);
        } else if (charCase === 'kCharCaseUpper') {
            charCode = c.toUpperCase().charCodeAt(0);
        }
        
        hash = (hash * FNV_PRIME) ^ BigInt(charCode);
        hash %= MODULUS;
    }
    
    return hash;
}

module.exports = {
    readGUID,
    writeGUID,
    fnv64HashString
};