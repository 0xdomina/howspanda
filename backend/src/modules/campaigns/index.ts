import { Module } from "@medusajs/framework/utils"
import CampaignsModuleService from "./service"

export const CAMPAIGNS_MODULE = "campaigns"

export default Module(CAMPAIGNS_MODULE, {
  service: CampaignsModuleService,
})
