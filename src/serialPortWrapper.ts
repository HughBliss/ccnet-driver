import { AutoDetectTypes } from '@serialport/bindings-cpp'
import { ReadlineParser, SerialPort, SerialPortOpenOptions } from 'serialport'

export class SerialPortIO implements Disposable {
  serialPort: SerialPort
  parser: ReadlineParser
  constructor (options : SerialPortOpenOptions<AutoDetectTypes>) {
    this.serialPort = new SerialPort(options)
    this.parser = new ReadlineParser()
    this.serialPort.pipe(this.parser)
  }

  async open (): Promise<void> {
    return new Promise((resolve, reject) => {
      this.serialPort.open((error) => {
        if (error) {
          reject(error)
        }
        resolve()
      })
    })
  }

  async sendCommandWithAwaitingData (req: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.serialPort.write(req, (error) => {
        if (error) {
          reject(error)
        }
      })
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
  }

  async sendCommand (req: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      this.serialPort.write(req, (error) => {
        if (error) {
          reject(error)
        }
        resolve()
      })
    })
  }

  async close (): Promise<void> {
    return new Promise((resolve, reject) => {
      this.parser.removeAllListeners()
      this.serialPort.close((error) => {
        if (error) {
          reject(error)
        }
        resolve()
      })
    })
  }

  [Symbol.dispose] (): void {
    this.close()
  }
}
