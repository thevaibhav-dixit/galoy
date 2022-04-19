import {
  BtcPaymentAmount,
  UsdPaymentAmount,
  WalletCurrency,
  ZERO_CENTS,
  ZERO_SATS,
} from "@domain/shared"

import { dealerMidPriceFunctions } from "@domain/dealer-price"
import { WalletInvoiceReceiver } from "@domain/wallet-invoices/wallet-invoice-receiver"

import { NewDealerPriceService } from "../../../mocks/dealer-price"

describe("WalletInvoiceReceiver", () => {
  const dealer = NewDealerPriceService(0 as Seconds)
  const { usdFromBtcMidPriceFn } = dealerMidPriceFunctions(dealer)
  const receivedBtc = BtcPaymentAmount(1200n)
  const recipientBtcWallet = {
    id: "recipientWalletId" as WalletId,
    currency: WalletCurrency.Btc,
    username: "Username" as Username,
  }
  const recipientUsdWallet = {
    id: "recipientWalletId" as WalletId,
    currency: WalletCurrency.Usd,
    username: "Username" as Username,
  }

  describe("for btc invoice", () => {
    const btcInvoice: WalletInvoice = {
      paymentHash: "paymentHash" as PaymentHash,
      selfGenerated: false,
      pubkey: "pubkey" as Pubkey,
      usdAmount: undefined,
      paid: false,
      receiverWalletDescriptor: recipientBtcWallet,
    }

    it("returns correct amounts", async () => {
      const walletInvoiceAmounts = await WalletInvoiceReceiver({
        walletInvoice: btcInvoice,
        receivedBtc,
        usdFromBtcMidPrice: usdFromBtcMidPriceFn,
        usdFromBtc: dealer.getCentsFromSatsForImmediateBuy,
      })

      if (walletInvoiceAmounts instanceof Error) throw walletInvoiceAmounts

      const usdToCreditReceiver = await usdFromBtcMidPriceFn(receivedBtc)

      if (usdToCreditReceiver instanceof Error) throw usdToCreditReceiver

      expect(walletInvoiceAmounts).toEqual(
        expect.objectContaining({
          usdBankFee: ZERO_CENTS,
          btcBankFee: ZERO_SATS,
          usdToCreditReceiver,
          btcToCreditReceiver: receivedBtc,
        }),
      )
    })
  })

  describe("for usd invoice", () => {
    describe("with cents amount", () => {
      const amountUsdInvoice: WalletInvoice = {
        paymentHash: "paymentHash" as PaymentHash,
        receiverWalletDescriptor: recipientUsdWallet,
        selfGenerated: false,
        pubkey: "pubkey" as Pubkey,
        usdAmount: UsdPaymentAmount(BigInt(100)),
        paid: false,
      }

      it("returns correct amounts", async () => {
        const walletInvoiceAmounts = await WalletInvoiceReceiver({
          walletInvoice: amountUsdInvoice,
          receivedBtc,
          usdFromBtcMidPrice: usdFromBtcMidPriceFn,
          usdFromBtc: dealer.getCentsFromSatsForImmediateBuy,
        })

        if (walletInvoiceAmounts instanceof Error) throw walletInvoiceAmounts

        expect(walletInvoiceAmounts).toEqual(
          expect.objectContaining({
            usdBankFee: ZERO_CENTS,
            btcBankFee: ZERO_SATS,
            usdToCreditReceiver: amountUsdInvoice.usdAmount,
            btcToCreditReceiver: receivedBtc,
          }),
        )
      })
    })
  })

  describe("for usd invoice", () => {
    describe("with no amount", () => {
      const noAmountUsdInvoice: WalletInvoice = {
        paymentHash: "paymentHash" as PaymentHash,
        receiverWalletDescriptor: recipientUsdWallet,
        selfGenerated: false,
        pubkey: "pubkey" as Pubkey,
        paid: false,
      }

      it("returns correct amounts", async () => {
        const walletInvoiceAmounts = await WalletInvoiceReceiver({
          walletInvoice: noAmountUsdInvoice,
          receivedBtc,
          usdFromBtcMidPrice: usdFromBtcMidPriceFn,
          usdFromBtc: dealer.getCentsFromSatsForImmediateBuy,
        })

        if (walletInvoiceAmounts instanceof Error) throw walletInvoiceAmounts

        const usdToCreditReceiver = await dealer.getCentsFromSatsForImmediateBuy(
          receivedBtc,
        )
        if (usdToCreditReceiver instanceof Error) throw usdToCreditReceiver

        expect(walletInvoiceAmounts).toEqual(
          expect.objectContaining({
            usdBankFee: ZERO_CENTS,
            btcBankFee: ZERO_SATS,
            usdToCreditReceiver,
            btcToCreditReceiver: receivedBtc,
          }),
        )
      })
    })
  })
})
