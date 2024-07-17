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

    wrapperInstance.parser.on('data', (data) => {
      console.log(data)
    })

    await wrapperInstance.sendCommandWithAwaitingData(requestDataFor('RESET'))

    for (; ;) {
      await wrapperInstance.sendCommandWithAwaitingData(requestDataFor('POLL'))
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  } catch (error) {
    console.error(error)
  }
})().then(() => { console.log('Done') }).catch(console.error)
