export class DeviceBusyError extends Error {
  constructor (message: string) {
    super(message)
    this.name = 'DeviceBusyError'
  }
}
