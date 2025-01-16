function readGUID(data) {
  
    // Convert the buffer to a hex string
    let guid = data.toString('hex');
  
    // Format the GUID string
    guid = `${guid.slice(0, 8)}-${guid.slice(8, 12)}-${guid.slice(12, 16)}-${guid.slice(16, 20)}-${guid.slice(20)}`;
  
    return guid;
  }

module.exports = {
    readGUID
};