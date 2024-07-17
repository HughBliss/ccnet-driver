import { hex2bin } from './helpers'

export enum COMMAND_HEX {
  RESET = 0x30,
  GET_STATUS = 0x31,
  SET_SECURITY = 0x32,
  POLL = 0x33,
  STACK = 0x35,
  RETURN = 0x36,
  IDENTIFICATION = 0x37,
  HOLD = 0x38,
  SET_BARCODE_PARAMETERS = 0x39,
  EXTRACT_BARCODE_DATA = 0x3A,
  GET_BILL_TABLE = 0x41,
  DOWNLOAD = 0x50,
  GET_CRC32_OF_THE_CODE = 0x51,
  REQUEST_STATISTICS = 0x60,
  ENABLE_BILL_TYPES = 0x34
}

export type COMMAND = keyof typeof COMMAND_HEX

export interface CommandIO {
  request: (data: Buffer | undefined) => Buffer
  response: (data: Buffer) => unknown
}

export const requestDataFor = (commandName: COMMAND, data?: Buffer): Buffer => {
  return Buffer.from([COMMAND_HEX[commandName], ...(data ?? [])])
}

export const commands: { [key in COMMAND]: CommandIO } = {
  GET_BILL_TABLE: {
    request: () => Buffer.from([COMMAND_HEX.GET_BILL_TABLE]),

    response: (data) => {
      const response = []
      let word

      for (let i = 0; i < 24; i++) {
        // Iterator by 5-byte world
        word = data.slice(i * 5, (i * 5 + 5))

        response.push({
          amount: word[0] * Math.pow(10, word[4]),
          code: word.slice(1, 4).toString()
        })
      }
      return response
    }
  },

  RESET: {
    request: () => Buffer.from([COMMAND_HEX.RESET]),

    response: (data: Uint8Array) => {
      switch (data[0]) {
        case 0:
          return 'Done'
        case 255:
          return 'Error'
        default:
          return 'Unknown response'
      }
    }
  },

  GET_STATUS: {
    request: () => Buffer.from([COMMAND_HEX.GET_STATUS]),
    response: function (data: Buffer) {
      return {
        enabledBills: hex2bin(data.subarray(0, 3)),
        highSecurity: hex2bin(data.subarray(3, 6))
      }
    }
  },

  ENABLE_BILL_TYPES: {
    request: (data) => Buffer.concat([Buffer.from([COMMAND_HEX.ENABLE_BILL_TYPES]), data ?? Buffer.alloc(0)]),

    response: (data) => {
      switch (data[0]) {
        case 0:
          return 'Done'

        case 255:
          return 'Error'
      }
    }
  },

  IDENTIFICATION: {
    request: () => Buffer.from([COMMAND_HEX.IDENTIFICATION]),

    response: (data) => ({
      Part: data.subarray(0, 15).toString().trim(),
      Serial: data.subarray(15, 27).toString().trim(),
      Asset: data.subarray(27, 34)
    })
  },

  HOLD: {
    request: () => Buffer.from([COMMAND_HEX.HOLD]),

    response: (data) => data
  },

  SET_BARCODE_PARAMETERS: {
    request: () => Buffer.from([COMMAND_HEX.SET_BARCODE_PARAMETERS]),

    response: (data) => data
  },

  EXTRACT_BARCODE_DATA: {
    request: () => Buffer.from([COMMAND_HEX.EXTRACT_BARCODE_DATA]),

    response: (data) => data
  },

  DOWNLOAD: {
    request: () => Buffer.from([COMMAND_HEX.DOWNLOAD]),

    response: (data) => data
  },

  GET_CRC32_OF_THE_CODE: {
    request: () => Buffer.from([COMMAND_HEX.GET_CRC32_OF_THE_CODE]),

    response: (data) => data
  },

  REQUEST_STATISTICS: {
    request: () => Buffer.from([COMMAND_HEX.REQUEST_STATISTICS]),

    response: (data) => data
  },
  SET_SECURITY: {
    request: () => Buffer.from([COMMAND_HEX.SET_SECURITY]),
    response: (data) => data
  },

  POLL: {
    request: () => Buffer.from([COMMAND_HEX.POLL]),
    response: (data) => data
  },

  STACK: {
    request: () => Buffer.from([COMMAND_HEX.STACK]),

    response: (data) => data
  },

  RETURN: {
    request: () => Buffer.from([COMMAND_HEX.RETURN]),
    response: (data) => data
  }
}
