"use client"

import React from "react"
import Input from "@modules/common/components/input"
import AccountInfo from "../account-info"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type MyInformationProps = {
  customer: HttpTypes.StoreCustomer
}

const ProfilePassword: React.FC<MyInformationProps> = ({ customer }) => {
  return (
    <div className="w-full">
      <AccountInfo
        label="Password"
        currentInfo={
          <span>Keep your account secure with an email-verified reset.</span>
        }
        isSuccess={false}
        isError={false}
        errorMessage={undefined}
        clearState={() => undefined}
        data-testid="account-password-editor"
      >
        <LocalizedClientLink href="/account?mode=forgot" className="figma-button">Reset password by email</LocalizedClientLink>
      </AccountInfo>
    </div>
  )
}

export default ProfilePassword
