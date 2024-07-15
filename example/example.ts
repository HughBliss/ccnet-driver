import { CCNET, DEVICE_TYPE } from "../src"



(async () => {
    using ccnet = new CCNET(
        'COM2',
        DEVICE_TYPE.BILL_VALIDATOR,
        true
    )

    const meta = await ccnet.identify()
})()
