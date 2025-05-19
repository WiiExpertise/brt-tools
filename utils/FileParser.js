class FileParser 
{
    constructor(buffer) 
    {
        this._buffer = buffer;
        this._offset = 0;
    }

    get buffer()
    {
        return this._buffer;
    }

    set buffer(buffer)
    {
        this._buffer = buffer;
        this._offset = 0;
    }

    get offset()
    {
        return this._offset;
    }

    set offset(offset)
    {
        this._offset = offset;
    }

    readBytes(length) 
    {
        const bytes = this._buffer.subarray(this._offset, this._offset + length);
        this._offset += length;
        return bytes;
    }

    readByte(offset)
    {
        return offset ? this._buffer.subarray(offset++, offset) : this._buffer.subarray(this._offset++, this._offset);
    }

    readNullTerminatedString(offset)
    {
        let string = "";
        let byte = this.readByte(offset++);
        while(byte[0] !== 0)
        {
            string += String.fromCharCode(byte[0]);
            byte = this.readByte(offset++);
        }
        return string;
    }

    readSizedString(length)
    {
        // Read the string, skipping any null bytes
        const bytes = this.readBytes(length);
        let string = "";
        for(let i = 0; i < bytes.length; i++)
        {
            if(bytes[i] !== 0)
            {
                string += String.fromCharCode(bytes[i]);
            }
        }

        // Return the string
        return string;
    }

    pad(alignment)
	{
		while(this._offset % alignment !== 0)
		{
			this._offset++;
		}
	}

};

module.exports = {
    FileParser
};