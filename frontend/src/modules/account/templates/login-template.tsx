"use client"

import { useSearchParams } from "next/navigation"
import { useState } from "react"

import Register from "@modules/account/components/register"
import Login from "@modules/account/components/login"
import ForgotPassword from "@modules/account/components/forgot-password"

export enum LOGIN_VIEW {
  SIGN_IN = "sign-in",
  REGISTER = "register",
  FORGOT_PASSWORD = "forgot-password",
}

const LoginTemplate = () => {
  const searchParams = useSearchParams()
  const [currentView, setCurrentView] = useState(() => {
    const mode = searchParams.get("mode")
    return mode === "register" ? LOGIN_VIEW.REGISTER : mode === "forgot" ? LOGIN_VIEW.FORGOT_PASSWORD : LOGIN_VIEW.SIGN_IN
  })

  return (
    <div className="figma-container flex min-h-[calc(100vh-180px)] items-center justify-center py-12 small:py-20">
      <div className="figma-surface w-full max-w-[480px] p-6 small:p-10">
        {currentView === "sign-in" ? (
          <Login setCurrentView={setCurrentView} />
        ) : currentView === "forgot-password" ? (
          <ForgotPassword setCurrentView={setCurrentView} />
        ) : (
          <Register setCurrentView={setCurrentView} />
        )}
      </div>
    </div>
  )
}

export default LoginTemplate
