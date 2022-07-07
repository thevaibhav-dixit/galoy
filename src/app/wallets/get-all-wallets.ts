import { LedgerService } from "@services/ledger"
import { WalletsRepository } from "@services/mongoose"

export const getAllWallets = async () => {
  const wallets = await WalletsRepository().listAll("BTC")
  if (wallets instanceof Error) return wallets
  const btcWalletsWithBalance = await Promise.all(
    wallets.map(async (wallet) => {
      const balance = await LedgerService().getWalletBalance(wallet.id)
      if (balance instanceof Error) return balance
      return { ...wallet, balance }
    }),
  )
  return btcWalletsWithBalance
}
