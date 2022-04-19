import { WalletCurrency, ZERO_CENTS, ZERO_SATS } from "@domain/shared"

export const WalletInvoiceReceiver = async ({
  walletInvoice,
  receivedBtc,
  usdFromBtc,
  usdFromBtcMidPrice,
}: WalletInvoiceReceiverArgs): Promise<
  WalletInvoiceReceiver | DealerPriceServiceError | ValidationError
> => {
  const zeroBankFee = {
    usdBankFee: ZERO_CENTS,
    btcBankFee: ZERO_SATS,
  }
  const btcToCreditReceiver = receivedBtc

  if (walletInvoice.receiverWalletDescriptor.currency === WalletCurrency.Btc) {
    const usdToCreditReceiver = await usdFromBtcMidPrice(btcToCreditReceiver)
    if (usdToCreditReceiver instanceof Error) return usdToCreditReceiver

    return {
      ...walletInvoice,
      btcToCreditReceiver,
      usdToCreditReceiver,
      receiverWalletDescriptor: walletInvoice.receiverWalletDescriptor,
      ...zeroBankFee,
    }
  }

  if (walletInvoice.usdAmount) {
    return {
      ...walletInvoice,
      btcToCreditReceiver,
      usdToCreditReceiver: walletInvoice.usdAmount,
      receiverWalletDescriptor: walletInvoice.receiverWalletDescriptor,
      ...zeroBankFee,
    }
  }

  const usdToCreditReceiver = await usdFromBtc(btcToCreditReceiver)
  if (usdToCreditReceiver instanceof Error) return usdToCreditReceiver

  return {
    ...walletInvoice,
    usdToCreditReceiver,
    btcToCreditReceiver,
    receiverWalletDescriptor: walletInvoice.receiverWalletDescriptor,
    ...zeroBankFee,
  }
}
