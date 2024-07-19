import { CCNET, DEVICE_TYPE } from '../src'

(async () => {
  using ccnet = new CCNET({
    path: 'COM2',
    deviceType: DEVICE_TYPE.BILL_VALIDATOR,
    isDebugMode: true,
    timeout: 10000
  })

  await ccnet.connect()

  const meta = await ccnet.identify()
  console.log({ meta })

  const result = await ccnet.escrow()

  console.log({ result })
})().then(() => { console.log('Done') })
  .catch(console.error)
