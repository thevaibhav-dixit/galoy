import { WalletsRepository } from "@services/mongoose"

export const getAllWallets = async (walletCurrency: WalletCurrency) => {
  const wallets = await WalletsRepository().listAll(walletCurrency)
  return wallets
}
