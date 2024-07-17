import { CCNET, DEVICE_TYPE } from '../src'

(
  async () => {
    using ccnet = new CCNET(
      'COM2',
      DEVICE_TYPE.BILL_VALIDATOR,
      true
    )

    await ccnet.connect()

    const meta = await ccnet.identify()

    console.log(meta)
  }
)().then(() => { console.log('Done') }).catch(console.error)
