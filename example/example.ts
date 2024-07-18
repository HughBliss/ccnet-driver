import { CCNET, DEVICE_TYPE } from '../src'

(async () => {
  using ccnet = new CCNET({
    path: '/dev/ttys021',
    deviceType: DEVICE_TYPE.BILL_VALIDATOR,
    isDebugMode: true,
    timeout: 10000
  })

  await ccnet.connect()

  //   const meta = await ccnet.identify()

//   console.log(meta)
})().then(() => { console.log('Done') })
  .catch(console.error)
