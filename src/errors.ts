import { type REJECT_REASON, REJECT_REASON_TEXT } from './statuses'

export class DeviceBusyError extends Error {
  constructor (message: string = '') {
    super('Device is busy. ' + message)
    this.name = 'DeviceBusyError'
  }
}

export class DeviceIsOfflineError extends Error {
  constructor (message: string = '') {
    super('Device is offline. ' + message)
    this.name = 'DeviceIsOfflineError'
  }
}

export class OperationRejectedError extends Error {
  rejectReason: REJECT_REASON
  constructor (rejectReason: REJECT_REASON) {
    super('Operation rejected. ' + REJECT_REASON_TEXT[rejectReason])
    this.name = 'OperationRejectedError'
    this.rejectReason = rejectReason
  }
}
