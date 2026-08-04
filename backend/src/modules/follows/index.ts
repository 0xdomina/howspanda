import { Module } from "@medusajs/framework/utils"
import FollowsModuleService from "./service"

export const FOLLOWS_MODULE = "follows"

export default Module(FOLLOWS_MODULE, {
  service: FollowsModuleService,
})
