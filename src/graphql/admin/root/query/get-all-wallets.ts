import { GT } from "@graphql/index"
import BtcWallet from "@graphql/types/object/btc-wallet"
import { getAllWallets } from "@app/wallets/get-all-wallets"
const getAllBtcWalletsQuery = GT.Field({
  type: GT.NonNullList(BtcWallet),
  resolve: async () => {
    const btcWallets = await getAllWallets()
    if (btcWallets instanceof Error) {
      throw btcWallets
    }
    return btcWallets
  },
})
export default getAllBtcWalletsQuery
