export const hex2bin = (buf: Buffer): boolean[] => {
  const d = []

  for (let i = 0, max = buf.length; i < max; i++) {
    // Iterator by bits
    for (let j = 8; j > 0; j--) {
      if ((buf[i] & Math.pow(2, j - 1)) > 0) {
        d.push(true)
      } else {
        d.push(false)
      }
    }
  }

  return d.reverse()
}

export const getCRC16 = (src: Buffer): Buffer => {
  const POLYNOMIAL = 0x08408
  const length = src.length
  let CRC = 0
  for (let i = 0; i < length; i++) {
    CRC ^= src[i]
    for (let j = 0; j < 8; j++) {
      if ((CRC & 0x0001) !== 0) {
        CRC >>= 1
        CRC ^= POLYNOMIAL
      } else {
        CRC >>= 1
      }
    }
  }

  const buf = Buffer.alloc(2)
  buf.writeUInt16BE(CRC, 0)

  // return Array.prototype.reverse.call(buf)
  return buf.swap16()
}
