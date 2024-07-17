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

    const responce = await wrapperInstance.sendCommandWithAwaitingData(requestDataFor('GET_STATUS', Buffer.from('\n')))

    console.log(responce.toString())

    for (; ;) {
      // await wrapperInstance.sendCommandWithAwaitingData(requestDataFor('POLL'))
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  } catch (error) {
    console.error(error)
  }
})().then(() => { console.log('Done') }).catch(console.error)
