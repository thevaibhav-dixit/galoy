import { Account } from "@services/mongoose/schema"

import {
  CouldNotFindError,
  CouldNotFindUserFromIdError,
  PersistError,
  RepositoryError,
} from "@domain/errors"

import { fromObjectId, toObjectId, parseRepositoryError } from "./utils"

export const AccountsIpRepository = (): IAccountsIPsRepository => {
  const update = async (accountIp: AccountIPs): Promise<true | RepositoryError> => {
    try {
      const result = await Account.updateOne(
        { _id: toObjectId<AccountId>(accountIp.id) },
        { $set: { lastConnection: new Date(), lastIPs: accountIp.lastIPs } },
      )

      if (result.matchedCount === 0) {
        return new CouldNotFindError("Couldn't find user")
      }

      if (result.modifiedCount !== 1) {
        return new PersistError("Couldn't update ip for user")
      }

      return true
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const findById = async (
    accountId: AccountId,
  ): Promise<AccountIPs | RepositoryError> => {
    try {
      const result = await Account.findOne(
        { _id: toObjectId<AccountId>(accountId) },
        { lastIPs: 1 },
      )
      if (!result) {
        return new CouldNotFindUserFromIdError(accountId)
      }

      return userIPsFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  return {
    update,
    findById,
  }
}

const userIPsFromRaw = (result: AccountRecord): AccountIPs => {
  return {
    id: fromObjectId<AccountId>(result._id),
    lastIPs: (result.lastIPs || []) as IPType[],
  }
}
