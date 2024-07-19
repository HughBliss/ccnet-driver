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
