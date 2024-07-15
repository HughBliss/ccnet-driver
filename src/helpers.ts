export const hex2bin = (buf: Buffer): boolean[] => {
  const d = []

  for (let i = 0, max = buf.length; i < max; i++) {
    // Iterator by bits
    for (let j = 8; j > 0; j--) {
      if (buf[i] & Math.pow(2, j - 1)) {
        d.push(true)
      } else {
        d.push(false)
      }
    }
  }

  return d.reverse()
}
