export function invoicePdfRelativePath(invoiceId: string): string {
  return `files/invoices/${invoiceId}.pdf`;
}
