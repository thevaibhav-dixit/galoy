import { WalletsRepository } from "@services/mongoose"

export const getAllWallets = async () => {
  const wallets = await WalletsRepository().listAll("BTC")
  return wallets
}
