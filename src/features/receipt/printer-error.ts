/** A printing failure with a message the cashier can act on. */
export class PrinterError extends Error {}

/** Nothing is saved yet: the UI opens the printer setup instead of failing. */
export class PrinterNotSetUpError extends PrinterError {
  constructor() {
    super('Printer belum diatur')
  }
}
