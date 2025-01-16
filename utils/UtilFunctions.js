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

module.exports = {
    readGUID
};