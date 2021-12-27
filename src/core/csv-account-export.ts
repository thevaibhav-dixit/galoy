import { LedgerService } from "@services/ledger"
import { createObjectCsvStringifier, createObjectCsvWriter } from "csv-writer"

const headers_field = [
  "id",
  "walletId",
  "type",
  "credit",
  "debit",
  "fee",
  "currency",
  "timestamp",
  "pendingConfirmation",
  "journalId",
  "lnMemo",
  "usd",
  "feeUsd",
  "recipientWalletId",
  "username",
  "memoFromPayer",
  "paymentHash",
  "pubkey",
  "feeKnownInAdvance",
  "address",
  "txHash",
]

const header = headers_field.map((item) => ({ id: item, title: item }))

export class CSVAccountExport {
  entries: LedgerTransaction[] = []

  getBase64(): string {
    const csvWriter = createObjectCsvStringifier({
      header,
    })

    const header_stringify = csvWriter.getHeaderString()
    const records = csvWriter.stringifyRecords(this.entries)

    const str = header_stringify + records

    // create buffer from string
    const binaryData = Buffer.from(str, "utf8")

    // decode buffer as base64
    const base64Data = binaryData.toString("base64")

    return base64Data
  }

  async saveToDisk(): Promise<void> {
    const csvWriter = createObjectCsvWriter({
      path: "export_accounts.csv",
      header,
    })

    await csvWriter.writeRecords(this.entries)
    console.log("saving complete")
  }

  async addWallet({ wallet }): Promise<void | Error> {
    const txs = await LedgerService().getLiabilityTransactions(wallet)
    if (txs instanceof Error) return txs

    this.entries.push(...txs)
  }
}
