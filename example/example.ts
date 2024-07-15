import { CCNET, DEVICE_TYPE } from "../src"



(async () => {
    using ccnet = new CCNET(
        '/dev/tty.usbserial',
        DEVICE_TYPE.BILL_VALIDATOR,
        true
    )

    const meta = await ccnet.identify()
})()
