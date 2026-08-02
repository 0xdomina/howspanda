"use client"

import { useState } from "react"

import SellerRegister from "@modules/seller/components/seller-register"
import SellerLogin from "@modules/seller/components/seller-login"

export enum SELLER_LOGIN_VIEW {
  SIGN_IN = "sign-in",
  REGISTER = "register",
}

const LoginTemplate = () => {
  const [currentView, setCurrentView] = useState<SELLER_LOGIN_VIEW>(
    SELLER_LOGIN_VIEW.SIGN_IN
  )

  return (
    <div className="w-full flex justify-center px-8 py-16">
      <div className="bg-paper-surface border border-ink-hairline rounded-large p-8 w-full max-w-md">
        {currentView === SELLER_LOGIN_VIEW.SIGN_IN ? (
          <SellerLogin setCurrentView={setCurrentView} />
        ) : (
          <SellerRegister setCurrentView={setCurrentView} />
        )}
      </div>
    </div>
  )
}

export default LoginTemplate