import { requestDataFor, SerialPortIO } from '../src'

(async () => {
  const wrapperInstance = new SerialPortIO({
    path: 'COM2',
    baudRate: 9600,
    parity: 'none',
    autoOpen: false,
    dataBits: 8,
    stopBits: 1
  })

  try {
    await wrapperInstance.open()

    console.log('sending RESET command')

    wrapperInstance.parser.on('data', (data) => {
      console.log('data', data)
    })

    await wrapperInstance.sendCommand(requestDataFor('RESET', Buffer.from('\r\n')))

    for (; ;) {
      await wrapperInstance.sendCommand(requestDataFor('POLL', Buffer.from('\r\n')))
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  } catch (error) {
    console.error(error)
  }
})().then(() => { console.log('Done') }).catch(console.error)
