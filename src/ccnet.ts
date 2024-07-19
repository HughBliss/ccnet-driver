import { ByteLengthParser, SerialPort } from 'serialport'
import { requestDataFor } from './commands'
import { DEVICE_TYPE } from './devicesTypes'
import { DeviceBusyError } from './errors'
import { getCRC16 as requestSignature } from './helpers'

interface DeviceMeta {
  Part: string
  Serial: string
  Asset: string
}

export class CCNET implements Disposable {
  private readonly sync: number = 0x02
  private readonly device: DEVICE_TYPE
  private isConnect: boolean
  private busy: boolean
  private readonly serialPort: SerialPort
  private readonly debugMode: boolean
  private readonly answerParser: ByteLengthParser
  private readonly timeout: number

  constructor ({ path, deviceType, timeout, isDebugMode = false }: {
    path: string
    deviceType: DEVICE_TYPE
    isDebugMode?: boolean
    timeout: number
  }) {
    this.device = deviceType // Type of device
    this.isConnect = false // Connection device status
    this.busy = false // Status of device
    this.debugMode = isDebugMode || false // Debug mode,
    this.timeout = timeout // Timeout for waiting response from device
    this.debug('Getting device type...')

    switch (this.device) {
      case DEVICE_TYPE.BILL_TO_BILL:
        throw new Error('Not implemented yet')
      case DEVICE_TYPE.COIN_CHANGER:
        throw new Error('Not implemented yet')
      case DEVICE_TYPE.BILL_VALIDATOR:
        this.debug('Bill Validator')
        break
      case DEVICE_TYPE.CARD_READER:
        throw new Error('Not implemented yet')
      default:
        throw new Error('Unknown device type: ' + deviceType)
    }

    this.serialPort = new SerialPort({
      path,
      baudRate: 9600,
      parity: 'none',
      autoOpen: false,
      dataBits: 8,
      stopBits: 1
    })

    this.answerParser = this.serialPort.pipe(
      new ByteLengthParser({
        length: 1
      })
    )
  }

  async [Symbol.dispose] (): Promise<void> {
    this.debug('Disconnecting from device...')
    await this.serialPortClose()
  }

  debug (message: string): void {
    if (this.debugMode) {
      console.log(message)
    }
  }

  async serialPortOpen (): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.serialPort.open((error) => {
        if (error instanceof Error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  async serialPortClose (): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.serialPort.close((error) => {
        if (error instanceof Error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  async serialPortWrite (data: Buffer): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.serialPort.write(data, (error) => {
        if (error instanceof Error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  async serialPortRead (): Promise<Buffer> {
    return await new Promise<Buffer>((resolve, reject) => {
      let answer: Buffer | undefined
      let length = 0
      let timer: NodeJS.Timeout | null = null
      const listenToAnswer = (data: Buffer): void => {
        this.debug('Data received: ' + data.toString('hex'))
        if (answer instanceof Buffer) {
          answer = Buffer.from([...answer, ...data])
        } else {
          answer = data
        }
        this.debug('Answer: ' + answer.toString('hex'))
        if (answer.length >= 3 && length === 0) {
          length = answer[2]
        }
        this.debug('Answer length: ' + length)
        if (length === answer.length) {
          this.debug('Answer length reached')
          this.answerParser.removeListener('data', listenToAnswer)
          if (timer !== null) {
            clearTimeout(timer)
          }
          this.debug('Resolving answer: ' + answer.toString('hex'))
          resolve(answer)
        }
      }
      this.answerParser.on('data', listenToAnswer)
      timer = setTimeout(() => {
        this.debug('Timeout reached')
        this.answerParser.removeListener('data', listenToAnswer)
        reject(new Error('Timeout reached'))
      }, this.timeout)
    })
  }

  async connect (): Promise<void> {
    try {
      this.debug('Connecting to device...')
      await this.serialPortOpen()
      this.debug('Connected!')
      this.isConnect = true
      this.debug('Reseting device...')
      await this.reset()
      await this.waitForReboot()
      this.debug('Device reseted!')
      const meta = await this.identify()
      this.debug('Device identified! Part: ' + meta.Part + ' Serial: ' + meta.Serial + ' Asset: ' + meta.Asset)
    } catch (error) {
      if (error instanceof Error) {
        this.debug('error while connecting to device: ' + error.message)
        throw new Error('error while connecting to device: ' + error.message)
      }
      this.debug(JSON.stringify(error))
    }
  }

  async identify (): Promise<DeviceMeta > {
    const buffer = await this.exec(requestDataFor('IDENTIFICATION'))
    if (!(buffer instanceof Buffer)) throw new Error('error while identifying device')
    const part = buffer.subarray(0.15).toString().trim()
    const serial = buffer.subarray(15, 27).toString().trim()
    const asset = buffer.subarray(27, 34).toString().trim()
    return { Part: part, Serial: serial, Asset: asset }
  }

  async waitForReboot (): Promise<void> {
    for (let i = 0; i < 10; ++i) {
      const result = await this.exec(requestDataFor('POLL'))
      if (result?.compare(Buffer.from([0x19])) === 0) return
      await new Promise<void>((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('Device did not reboot')
  }

  async reset (): Promise<void> {
    await this.exec(requestDataFor('RESET'))
  }

  async exec (request: Buffer): Promise<Buffer | undefined> {
    if (!this.isConnect) throw new Error('Device is not connected!')
    if (this.busy) throw new DeviceBusyError('Device is busy')
    this.debug('Sending request: ' + request.toString('hex'))
    request = Buffer.from([this.sync, this.device, request.length + 5, ...request])
    request = Buffer.from([...request, ...requestSignature(request)])
    this.debug('Sending request with CRC: ' + request.toString('hex'))
    this.debug('device is busy now')
    this.busy = true
    try {
      await this.serialPortWrite(request)
      this.debug('Request sent')
      this.debug('Waiting for response...')
      const response = await this.serialPortRead()
      this.debug('Response received: ' + response.toString('hex'))
      const validatedAnswer = await this.checkAnswerIsValid(response)
      this.debug('Response validated: ' + validatedAnswer.toString('hex'))
      return validatedAnswer
    } finally {
      this.debug('Device is not busy anymore')
      this.busy = false
    }
  }

  async checkAnswerIsValid (answer: Buffer): Promise<Buffer> {
    if (answer[0] !== this.sync || answer[1] !== this.device) {
      throw new Error('Wrong response target')
    }
    const ln = answer.length
    const signature = answer.subarray(ln - 2, ln)
    const answerWithoutSignature = answer.subarray(0, ln - 2)
    const data = answer.subarray(3, ln - 2)
    if (signature.compare(requestSignature(answerWithoutSignature)) !== 0) {
      throw new Error('Wrong response command hash')
    } else {
      let ok = Buffer.from([this.sync, this.device, 0x06, 0x00])
      ok = Buffer.from([...ok, ...requestSignature(ok)])
      await this.serialPortWrite(ok)
    }
    return data
  }

  // handleResponse (response: Buffer): void {
  //   this.debug(response.toString())
  //   this.debug('Sync: ' + this.sync)
  //   this.debug('Device: ' + this.device.toString(16))

  //   if (response[0] !== this.sync || response[1] !== this.device) {
  //     throw new Error('Wrong response target')
  //   }

  // }

  // /**
  //    * Connect to device
  //    * @param cb {Function} Callback function
  //    */
  // connect (cb : () =>void) {
  //   const self = this

  //   async.waterfall([

  //     // Connect to device
  //     function (callback) {
  //       debug('Connect to device...')
  //       self.serialPort.open(callback)
  //     },

  //     // Reset
  //     function (callback) {
  //       debug('Connected!')
  //       self.isConnect = true
  //       self.execute('RESET', null, callback)
  //     },

  //     // Waiting "Unit disabled" status
  //     function (r, callback) {
  //       var timer = setInterval(function () {
  //         debug('Timer1')
  //         self.execute('POLL', null, function (err, data) {
  //           switch (data.toString('hex')) {
  //             // Device rebooted
  //             case '19':
  //               clearInterval(timer)
  //               callback()
  //               break
  //           }
  //         })
  //       }, 100)
  //     },

  //     // Get status
  //     function (callback) {
  //       // @todo: get status
  //       callback()
  //     },

  //     // Get Bill Table
  //     function (callback) {
  //       // @todo: get bill table
  //       callback()
  //     },

  //     // Set security
  //     function (callback) {
  //       // @todo: set security
  //       callback()
  //     },

  //     // Identification
  //     function (callback) {
  //       self.execute('IDENTIFICATION', null, callback)
  //     },

  //     function (data) {
  //       cb(null, data)
  //     }

  //   ], function (err) {
  //     if (err) {
  //       return cb(err)
  //     }
  //   })
  // }
  //   /**
  //      * Disconnect from device
  //      * @param cb {Function} callback function
  //      */
  //   close (cb) {
  //     clearInterval(this.globalTimer)
  //     this.serialPort.close(cb)
  //   }

  //   /**
  //      * Send command to device and prepare the answer
  //      * @param command {String} Command name
  //      * @param data {Object} Command data
  //      * @param cb {Function} Callback function
  //      */
  //   execute (command, data, cb) {
  //     debug('[Execute] Command: ' + command + ' data: ' + data)
  //     if (this.isConnect == false) {
  //       return cb(new Error('Device is not connected!'))
  //     }

  //     this.command = commands[command]

  //     if (this.command == undefined) {
  //       return cb(new Error('Command not found: ' + command))
  //     }

  //     if (this.busy) {
  //       return cb(new Error('Device is busy'))
  //     }

  //     this._sendCommand(this.command.request(data), cb)
  //   }
  //   /**
  //      * Escrow banknotes
  //      * @param a {Array} hex-numberic array
  //      * @param b {Function} callback function
  //      */
  //   escrow (a, b) {
  //     let billsEnable, cb, billTable

  //     switch (typeof a) {
  //       case 'array':
  //         billsEnable = a
  //         cb = b
  //         break

  //       case 'function':
  //         cb = a
  //         billsEnable = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]
  //         break

  //       default:
  //         throw new Error('Undefined parameters')
  //     }

  //     const self = this

  //     async.waterfall([

  //       function (callback) {
  //         self.execute('GET BILL TABLE', null, callback)
  //       },

  //       function (btbl, callback) {
  //         billTable = btbl
  //         self.execute('ENABLE BILL TYPES', billsEnable, callback)
  //       },

  //       function () {
  //         let state

  //         this.globalTimer = setInterval(function () {
  //           self.execute('POLL', null, function (err, data) {
  //             if (err) {
  //               debug(err)
  //               return
  //             }

  //             // Handle new state
  //             const newState = data[0].toString(16)
  //             if (state != newState) {
  //               state = newState

  //               if (data[0].toString(16) == '80') {
  //                 cb.call(self, null, billTable[data[1]])
  //               }
  //             }
  //           })
  //         }, 100)
  //       }

  //     ], function (err) {
  //       return cb(err)
  //     })
  //     }

  //   /**
  //      * Stack banknote
  //      * @param cb
  //      */
  //   stack (cb) {
  //     this.execute('STACK', null, cb)
  //   }

  //   /**
  //      * Return banknote
  //      * @param cb
  //      */
  //   retrieve:  (cb) {
  //     this.execute('RETURN', null, cb)
  //   }

  //   /**
  //      * End of stack
  //      * @param cb
  //      */
  //   end (cb) {
  //     clearTimeout(this.globalTimer)
  //     this.execute('ENABLE BILL TYPES', [0x00, 0x00, 0x00, 0x00, 0x00, 0x00], cb)
  //   }

  //   // Helper for send and receive commands
  //   _sendCommand:  (c, callback) {
  //     this.busy = true
  //     const self = this

  //     // Clear old listener
  //     if (this.globalListener && typeof this.globalListener === 'function') {
  //       this.serialPort.removeListener('data', this.globalListener)
  //       this.globalListener = false
  //     }

  //     let cmd = Buffer.concat([new Buffer(
  //       [
  //         this.sync, // SYNC
  //         this.device // ADR
  //       ]
  //     ), new Buffer([(c.length + 5)]), c])

  //     cmd = Buffer.concat([cmd, getCRC16(cmd)])

  //     this.serialPort.write(cmd, function (err) {
  //       if (err) {
  //         self.busy = false
  //         return callback(err)
  //       }
  //     })

  //     let b = false
  //     let ln = 0

  //     this.globalListener = function (data) {
  //       if (b) {
  //         b = Buffer.concat([b, data])
  //       } else {
  //         b = data
  //       }

  //       // Set response length
  //       if (b.length >= 3 && ln == 0) {
  //         ln = parseInt(b[2].toString())
  //       }

  //       if (ln == b.length) {
  //         self.serialPort.removeListener('data', self.globalListener)
  //         self.globalListener = false
  //         self.busy = false
  //         return self._checkResponse(b, callback)
  //       }
  //     }

  //     this.serialPort.on('data', this.globalListener)
  //   }

  //   // Check response
  //   _checkResponse (response, callback) {
  //     const self = this

  //     // Check response address
  //     debug(response)
  //     debug('Sync: ' + this.sync)
  //     debug('Device: ' + this.device.toString(16))
  //     if (response[0] != this.sync || response[1] != this.device) {
  //       return callback(new Error('Wrong response target'))
  //     }

  //     // Check CRC
  //     const ln = response.length
  //     const checkCRC = response.slice(ln - 2, ln)
  //     const responseCRCslice = response.slice(0, ln - 2)
  //     const data = response.slice(3, ln - 2)

  //     if (checkCRC.toString() != (getCRC16(responseCRCslice)).toString()) {
  //       return callback(new Error('Wrong response command hash'))
  //     } else {
  //       const cmd = new Buffer([0x02, self.device, 0x06, 0x00])
  //       const c = Buffer.concat([cmd, getCRC16(cmd)])

  //       self.serialPort.write(c, function (err) {
  //         if (typeof callback === 'function') {
  //           return callback.call(self, err, self.command.response(data))
  //         }
  //       })
  //     }
  // }

  // }

  // // Helper for calculation CRC16 check sum
  // function getCRC16 (bufData) {
  //   const POLYNOMIAL = 0x08408
  //   const sizeData = bufData.length
  //   let CRC, i, j
  //   CRC = 0
  //   for (i = 0; i < sizeData; i++) {
  //     CRC ^= bufData[i]
  //     for (j = 0; j < 8; j++) {
  //       if (CRC & 0x0001) {
  //         CRC >>= 1
  //         CRC ^= POLYNOMIAL
  //       } else CRC >>= 1
  //     }
  //   }

  //   const buf =  Buffer.from([2])
  //   buf.writeUInt16BE(CRC, 0)
  //   CRC = buf

//   return Array.prototype.reverse.call(CRC)
}
