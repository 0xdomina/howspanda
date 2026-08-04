import { Module } from "@medusajs/framework/utils"
import UserWalletModuleService from "./service"

export const USER_WALLET_MODULE = "userWallet"

export default Module(USER_WALLET_MODULE, {
  service: UserWalletModuleService,
})
