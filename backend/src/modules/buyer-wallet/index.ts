import { Module } from "@medusajs/framework/utils"
import BuyerWalletModuleService from "./service"

export const BUYER_WALLET_MODULE = "buyerWallet"

export default Module(BUYER_WALLET_MODULE, {
  service: BuyerWalletModuleService,
})
