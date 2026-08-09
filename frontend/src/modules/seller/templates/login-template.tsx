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
    <div className="figma-container flex min-h-[calc(100vh-180px)] items-center justify-center py-12 small:py-20">
      <div className="figma-surface w-full max-w-[480px] p-6 small:p-10">
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
