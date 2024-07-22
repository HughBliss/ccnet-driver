import { ByteLengthParser, SerialPort } from 'serialport'
import { type COMMAND, COMMAND_HEX } from './commands'
import { DEVICE_TYPE } from './devicesTypes'
import { DeviceBusyError, DeviceIsOfflineError, OperationRejectedError } from './errors'
import { getCRC16 as requestSignature } from './helpers'
import { STATUS } from './statuses'
export interface DeviceMeta {
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

  async connect (): Promise<void> {
    this.debug('Connecting to device...')
    await this.serialPortOpen()
    this.debug('Connected!')
    this.isConnect = true
    await this.reset()
    await this.waitForReboot()
    // const meta = await this.identify()
    // this.debug(`Device identified: ${JSON.stringify(meta)}`)
  }

  async stack (): Promise<void> {
    await this.exec(this.requestDataFor('STACK'))
    await this.waitFor(STATUS.BILL_STACKED)
  }

  async return (): Promise<void> {
    await this.exec(this.requestDataFor('RETURN'))
    await this.waitFor(STATUS.BILL_RETURNED)
  }

  async escrow ({ billsToEnable = [], signal }: {
    billsToEnable?: number[]
    signal?: AbortSignal
  } = {}): Promise<Bill> {
    if (billsToEnable.length === 0) {
      billsToEnable = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF] // Enable all bills
    }
    const billTableBuffer = await this.exec(this.requestDataFor('GET_BILL_TABLE'))
    if (!(billTableBuffer instanceof Buffer)) throw new Error('error while getting bill table')

    const billTable = this.parseBillTable(billTableBuffer)

    if (this.debugMode) billTable.debug()

    await this.exec(this.requestDataFor('ENABLE_BILL_TYPES', Buffer.from(billsToEnable)))
    const [billPosition] = await this.waitFor(STATUS.ESCROW_POSITION, { signal, attempts: 500, frequency: 200 }) // 500 attempts * 200ms = 100s = 1m40s
    return billTable.getBillByCode(billPosition) ?? { amount: 0, code: 0, countyCode: COUNTRY.RUS }
  }

  async identify (): Promise<DeviceMeta > {
    const buffer = await this.exec(this.requestDataFor('IDENTIFICATION'))
    if (!(buffer instanceof Buffer)) throw new Error('error while identifying device')
    const part = buffer.subarray(0.15).toString().trim()
    const serial = buffer.subarray(15, 27).toString().trim()
    const asset = buffer.subarray(27, 34).toString().trim()
    return { Part: part, Serial: serial, Asset: asset }
  }

  async waitForReboot (): Promise<void> {
    await this.waitFor(STATUS.UNIT_DISABLED)
  }

  async waitFor (status: STATUS, {
    attempts = 100,
    frequency = 500,
    signal
  }: {
    attempts?: number
    frequency?: number
    signal?: AbortSignal
  } = {}): Promise<Buffer> {
    return await new Promise<Buffer>((resolve, reject) => {
      const abortListener = (): void => {
        signal?.removeEventListener('abort', abortListener)
        reject(new Error('' + (signal?.reason ?? 'Aborted')))
      }
      signal?.addEventListener('abort', abortListener)
      let timer: NodeJS.Timeout | null = null
      const rejectAndClear = (error: Error): void => {
        if (timer !== null) { clearInterval(timer) }
        signal?.removeEventListener('abort', abortListener)
        reject(error)
      }
      let i = 0
      timer = setInterval(() => {
        if (i >= attempts) { rejectAndClear(new Error('Device did not reach the expected status')); return }
        if (signal?.aborted ?? false) { rejectAndClear(new Error('Aborted')); return }
        this.exec(this.requestDataFor('POLL')).then((result) => {
          if (!(result instanceof Buffer)) { rejectAndClear(new Error('Unexpected response')); return }
          if (result[0] === STATUS.REJECTING) { rejectAndClear(new OperationRejectedError(result[1])); return }
          if (result[0] === status) {
            if (timer !== null) clearInterval(timer)
            signal?.removeEventListener('abort', abortListener)
            resolve(result.subarray(1))
          }
        }).catch((err) => {
          if (err instanceof DeviceBusyError) return
          if (!(err instanceof Error)) { rejectAndClear(new Error('Unexpected error')); return }
          rejectAndClear(err)
        })
        i++
      }, frequency)
    })
  }

  async reset (): Promise<void> {
    await this.exec(this.requestDataFor('RESET'))
  }

  async exec (request: Buffer): Promise<Buffer | undefined> {
    if (!this.isConnect) throw new DeviceIsOfflineError()
    if (this.busy) throw new DeviceBusyError()
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
      // let ok = Buffer.from([this.sync, this.device, 0x06, 0x00])
      // ok = Buffer.from([...ok, ...requestSignature(ok)])
      // await this.serialPortWrite(ok)
    }
    return data
  }

  async serialPortOpen (): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.serialPort.open((error) => {
        if (error instanceof Error) { reject(error); return }
        resolve()
      })
    })
  }

  async serialPortClose (): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.serialPort.close((error) => {
        if (error instanceof Error) { reject(error); return }
        resolve()
      })
    })
  }

  async serialPortWrite (data: Buffer): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.serialPort.write(data, (error) => {
        if (error instanceof Error) { reject(error); return }
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
        if (answer instanceof Buffer) {
          answer = Buffer.from([...answer, ...data])
        } else {
          answer = data
        }
        if (answer.length >= 3 && length === 0) {
          length = answer[2]
          this.debug('Answer length: ' + length)
        }
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

  debug (message: string): void {
    if (this.debugMode) {
      console.log(message)
    }
  }

  async dispose (): Promise<void> {
    await this[Symbol.dispose]()
  }

  async [Symbol.dispose] (): Promise<void> {
    this.debug('Disconnecting from device...')
    await this.serialPortClose()
  }

  // The 120 - byte string consists from 24 five-byte words.
  // Byte 1 of word – most significant digit(s) of the denomination.
  // Bytes 2-4 of word – country code in ASCII characters.
  // Byte 5 of word – this byte used to determine decimal placement or proceeding zeros. If bit D7 is 0, the
  // bits D0-D6 indicate the number of proceeding zeros. If bit D7 is 1, the bits D0-D6 indicates the decimal
  // point position starting from the right and moving to the left.
  // A five-byte position in the 120-bytes string indicates bill type description for the particular bill type. For
  // example, first five byte correspond bill type=0, second five byte correspond bill type=1 and so on.
  parseBillTable (buffer: Buffer): BillTable {
    const billTable: Record<number, Bill> = {}
    for (let i = 0; i < 24; i++) {
      const denomination = buffer[i * 5]
      const country = buffer.subarray(i * 5 + 1, i * 5 + 4).toString()
      const decimal = buffer[i * 5 + 4]
      const zeros = decimal & 0b01111111
      const decimalPosition = decimal >> 7
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      const denominationString = decimalPosition ? '0' + '0'.repeat(zeros) + denomination : denomination + '0'.repeat(zeros)
      billTable[i] = {
        amount: parseInt(denominationString),
        code: i,
        countyCode: country as COUNTRY
      }
    }
    return new BillTable(billTable)
  }

  requestDataFor (commandName: COMMAND, data?: Buffer): Buffer {
    this.debug(`Executing command: ${commandName}` + ((data != null) ? ` with data: ${data.toString('hex')}` : ''))
    return Buffer.from([COMMAND_HEX[commandName], ...(data ?? [])])
  }
}

export enum COUNTRY {
  RUS = 'RUS',
}

export interface Bill {
  amount: number
  code: number
  countyCode: COUNTRY
}

export class BillTable {
  private readonly table: Record<number, Bill>
  constructor (table: Record<number, Bill>) {
    this.table = table
  }

  getBillByCode (code: number): Bill | undefined {
    return this.table[code]
  }

  debug (): void {
    Object.entries(this.table).forEach(([key, value]) => {
      console.log(`Bill type ${key}: ${value.amount} ${value.countyCode}`)
    })
  }
}
