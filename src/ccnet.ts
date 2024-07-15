import { requestDataFor } from './commands'
import { DEVICE_TYPE } from './devicesTypes'
import { SerialPortIO } from './serialPortWrapper'

type DeviceMeta = {
  Part: string
  Serial: string
  Asset: string
}

export class CCNET implements Disposable {
  private sync: number
  private device: DEVICE_TYPE
  private isConnect: boolean
  private busy: boolean
  private globalTimer: NodeJS.Timeout | false
  private globalListener: ((data: Buffer) => void) | false
  private serialPort: SerialPortIO
  private debugMode: boolean

  constructor (path: string, deviceType : DEVICE_TYPE, isDebugMode : boolean = false) {
    this.sync = 0x02 // Constant
    this.device = deviceType // Type of device
    this.isConnect = false // Connection device status
    this.busy = false // Status of device
    this.debugMode = isDebugMode || false // Debug mode,
    this.globalTimer = false
    this.globalListener = false

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

    this.serialPort = new SerialPortIO({
      path,
      baudRate: 9600,
      parity: 'none',
      autoOpen: false,
      dataBits: 8,
      stopBits: 1
    })
  }

  [Symbol.dispose] (): void {
    this.serialPort.close()
  }

  debug (message : string) {
    if (this.debugMode) {
      // eslint-disable-next-line no-console
      console.log(message)
    }
  }

  async connect (): Promise<void> {
    try {
      this.debug('Connecting to device...')
      await this.serialPort.open()
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
      this.debug(`${error}`)
    }
  }

  async identify (): Promise<DeviceMeta> {
    const buffer = await this.exec(() => this.serialPort.sendCommandWithAwaitingData(requestDataFor('IDENTIFICATION')))
    const part = buffer.subarray(0.15).toString().trim()
    const serial = buffer.subarray(15, 27).toString().trim()
    const asset = buffer.subarray(27, 34).toString().trim()
    return { Part: part, Serial: serial, Asset: asset }
  }

  waitForReboot (): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        this.poll().then((data) => {
          if (data.toString('hex') === '19') {
            clearInterval(timer)
            resolve()
          }
        }).catch((error) => {
          clearInterval(timer)
          reject(error)
        })
      }, 100)
    })
  }

  poll (): Promise<Buffer> {
    return this.exec(() => this.serialPort.sendCommandWithAwaitingData(requestDataFor('POLL')))
  }

  reset (): Promise<void> {
    return this.exec(() => this.serialPort.sendCommand(requestDataFor('RESET')))
  }

  async exec<T> (fn : () => Promise<T>): Promise<T> {
    if (!this.isConnect) throw new Error('Device is not connected!')
    if (this.busy) throw new Error('Device is busy')
    this.busy = true
    let response : T | undefined
    try {
      response = await fn()
    } finally {
      this.busy = false
    }
    return response
  }

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
