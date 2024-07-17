import { type AutoDetectTypes } from '@serialport/bindings-cpp'
import { ReadlineParser, SerialPort, type SerialPortOpenOptions } from 'serialport'

export class SerialPortIO implements Disposable {
  serialPort: SerialPort
  parser: ReadlineParser
  constructor (options: SerialPortOpenOptions<AutoDetectTypes>) {
    this.serialPort = new SerialPort(options)
    this.parser = new ReadlineParser({ delimiter: '\r\n' })
    this.serialPort.pipe(this.parser)
  }

  async open (): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.serialPort.open((error) => {
        if (error instanceof Error) {
          reject(error)
        }
        resolve()
      })
    })
  }

  async sendCommandWithAwaitingData (req: Buffer): Promise<Buffer> {
    console.log('start sending command', req)

    return await new Promise((resolve, reject) => {
      this.serialPort.write(req, (error) => {
        console.log('command sent')

        if (error != null) {
          console.log('error', error)

          reject(error)
        }

        console.log('waiting for data')

        this.parser.once('data', (data) => {
          if (data instanceof Buffer) {
            resolve(data)
          }
          if (typeof data === 'string') {
            resolve(Buffer.from(data))
          }
          reject(new Error('Invalid data type'))
        })
      })
    })
  }

  async sendCommand (req: Buffer): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.serialPort.write(req, (error) => {
        if (error instanceof Error) {
          reject(error)
        }
        resolve()
      })
    })
  }

  async close (): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.parser.removeAllListeners()
      this.serialPort.close((error) => {
        if (error !== null) {
          reject(error)
        }
        resolve()
      })
    })
  }

  async [Symbol.dispose] (): Promise<void> {
    await this.close()
  }
}
