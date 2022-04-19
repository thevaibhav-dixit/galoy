import { getCurrentPrice } from "@app/prices"
import { InvoiceNotFoundError } from "@domain/bitcoin/lightning"
import { CouldNotFindError } from "@domain/errors"
import {
  centsFromUsdPaymentAmount,
  paymentAmountFromSats,
  WalletCurrency,
} from "@domain/shared"
import { LockService } from "@services/lock"
import { NewDealerPriceService } from "@services/dealer-price"
import { LndService } from "@services/lnd"
import { WalletInvoicesRepository } from "@services/mongoose"
import { NotificationsService } from "@services/notifications"
import { runInParallel } from "@utils"
import { WalletInvoiceReceiver } from "@domain/wallet-invoices/wallet-invoice-receiver"
import * as LedgerFacade from "@services/ledger/facade"
import { usdFromBtcMidPriceFn } from "@app/shared"

export const updatePendingInvoices = async (logger: Logger): Promise<void> => {
  const invoicesRepo = WalletInvoicesRepository()

  const walletIdsWithPendingInvoices = invoicesRepo.listWalletIdsWithPendingInvoices()

  if (walletIdsWithPendingInvoices instanceof Error) {
    logger.error(
      { error: walletIdsWithPendingInvoices },
      "finish updating pending invoices with error",
    )
    return
  }

  await runInParallel({
    iterator: walletIdsWithPendingInvoices,
    logger,
    processor: async (walletId: WalletId, index: number) => {
      logger.trace(
        "updating pending invoices for wallet %s in worker %d",
        walletId,
        index,
      )
      await updatePendingInvoicesByWalletId({ walletId, logger })
    },
  })

  logger.info("finish updating pending invoices")
}

export const updatePendingInvoicesByWalletId = async ({
  walletId,
  logger,
  lock,
}: {
  walletId: WalletId
  logger: Logger
  lock?: DistributedLock
}) => {
  const invoicesRepo = WalletInvoicesRepository()

  const invoices = invoicesRepo.findPendingByWalletId(walletId)
  if (invoices instanceof Error) return invoices

  for await (const walletInvoice of invoices) {
    await updatePendingInvoice({ walletInvoice, logger, lock })
  }
}

export const updatePendingInvoiceByPaymentHash = async ({
  paymentHash,
  logger,
  lock,
}: {
  paymentHash: PaymentHash
  logger: Logger
  lock?: DistributedLock
}): Promise<boolean | ApplicationError> => {
  const invoicesRepo = WalletInvoicesRepository()
  const walletInvoice = await invoicesRepo.findByPaymentHash(paymentHash)
  if (walletInvoice instanceof CouldNotFindError) {
    logger.info({ paymentHash }, "WalletInvoice doesn't exist")
    return false
  }
  if (walletInvoice instanceof Error) return walletInvoice
  return updatePendingInvoice({ walletInvoice, logger, lock })
}

const dealer = NewDealerPriceService()

const updatePendingInvoice = async ({
  walletInvoice,
  logger,
  lock,
}: {
  walletInvoice: WalletInvoice
  logger: Logger
  lock?: DistributedLock
}): Promise<boolean | ApplicationError> => {
  const lndService = LndService()
  if (lndService instanceof Error) return lndService

  const walletInvoicesRepo = WalletInvoicesRepository()

  const { pubkey, paymentHash, receiverWalletDescriptor } = walletInvoice

  const lnInvoiceLookup = await lndService.lookupInvoice({ pubkey, paymentHash })
  if (lnInvoiceLookup instanceof InvoiceNotFoundError) {
    const isDeleted = await walletInvoicesRepo.deleteByPaymentHash(paymentHash)
    if (isDeleted instanceof Error) {
      logger.error(
        { walletInvoice, error: isDeleted },
        "impossible to delete WalletInvoice entry",
      )
      return isDeleted
    }
    return false
  }
  if (lnInvoiceLookup instanceof Error) return lnInvoiceLookup

  if (!lnInvoiceLookup.isSettled) {
    logger.debug({ invoice: lnInvoiceLookup }, "invoice has not been paid")
    return false
  }

  const {
    lnInvoice: { description },
    roundedDownReceived,
  } = lnInvoiceLookup

  const pendingInvoiceLogger = logger.child({
    hash: paymentHash,
    walletId: receiverWalletDescriptor.id,
    topic: "payment",
    protocol: "lightning",
    transactionType: "receipt",
    onUs: false,
  })

  if (walletInvoice.paid) {
    pendingInvoiceLogger.info("invoice has already been processed")
    return true
  }

  const walletInvoiceReceiver = await WalletInvoiceReceiver({
    walletInvoice,
    receivedBtc: paymentAmountFromSats(roundedDownReceived),
    usdFromBtc: dealer.getCentsFromSatsForImmediateBuy,
    usdFromBtcMidPrice: usdFromBtcMidPriceFn,
  })
  if (walletInvoiceReceiver instanceof Error) return walletInvoiceReceiver

  const lockService = LockService()
  return lockService.lockPaymentHash({ paymentHash, logger, lock }, async () => {
    // we're getting the invoice another time, now behind the lock, to avoid potential race condition
    const invoiceToUpdate = await walletInvoicesRepo.findByPaymentHash(paymentHash)
    if (invoiceToUpdate instanceof CouldNotFindError) {
      pendingInvoiceLogger.error({ paymentHash }, "WalletInvoice doesn't exist")
      return false
    }
    if (invoiceToUpdate instanceof Error) return invoiceToUpdate
    if (invoiceToUpdate.paid) {
      pendingInvoiceLogger.info("invoice has already been processed")
      return true
    }

    const displayCurrencyPerSat = await getCurrentPrice()
    if (displayCurrencyPerSat instanceof Error) return displayCurrencyPerSat

    // TODO: this should be a in a mongodb transaction session with the ledger transaction below
    // markAsPaid could be done after the transaction, but we should in that case not only look
    // for walletInvoicesRepo, but also in the ledger to make sure in case the process crash in this
    // loop that an eventual consistency doesn't lead to a double credit

    const invoicePaid = await walletInvoicesRepo.markAsPaid(paymentHash)
    if (invoicePaid instanceof Error) return invoicePaid

    const metadata = LedgerFacade.LnReceiveLedgerMetadata({
      paymentHash,
      fee: walletInvoiceReceiver.btcBankFee,
      feeDisplayCurrency: Number(
        walletInvoiceReceiver.usdBankFee.amount,
      ) as DisplayCurrencyBaseAmount,
      amountDisplayCurrency: Number(
        walletInvoiceReceiver.usdToCreditReceiver.amount,
      ) as DisplayCurrencyBaseAmount,
      pubkey: walletInvoiceReceiver.pubkey,
    })

    const result = await LedgerFacade.recordReceive({
      description,
      recipientWalletDescriptor: walletInvoiceReceiver.receiverWalletDescriptor,
      amountToCreditReceiver: {
        usd: walletInvoiceReceiver.usdToCreditReceiver,
        btc: walletInvoiceReceiver.btcToCreditReceiver,
      },
      bankFee: {
        usd: walletInvoiceReceiver.usdBankFee,
        btc: walletInvoiceReceiver.btcBankFee,
      },
      metadata,
      txMetadata: {
        hash: metadata.hash,
      },
    })

    if (result instanceof Error) return result

    const notificationsService = NotificationsService(logger)

    if (receiverWalletDescriptor.currency === WalletCurrency.Btc) {
      notificationsService.lnInvoiceBitcoinWalletPaid({
        paymentHash,
        recipientWalletId: receiverWalletDescriptor.id,
        sats: roundedDownReceived,
        displayCurrencyPerSat,
      })
    } else {
      notificationsService.lnInvoiceUsdWalletPaid({
        paymentHash,
        recipientWalletId: receiverWalletDescriptor.id,
        cents: centsFromUsdPaymentAmount(walletInvoiceReceiver.usdToCreditReceiver),
        displayCurrencyPerSat,
      })
    }

    return true
  })
}
