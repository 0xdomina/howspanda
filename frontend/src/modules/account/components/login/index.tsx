import { login } from "@lib/data/customer"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import GoogleSignIn from "@modules/account/components/google-signin"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useActionState } from "react"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

const Login = ({ setCurrentView }: Props) => {
  const [message, formAction] = useActionState(login, null)

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="login-page"
    >
      <h1 className="text-large-semi uppercase mb-6">Sign in</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-8">
        Sign in to keep shopping, selling, and delivering on How&rsquo;s u.
      </p>
      <form className="w-full" action={formAction}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="Email"
            name="email"
            type="email"
            title="Enter a valid email address."
            autoComplete="email"
            required
            data-testid="email-input"
          />
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            data-testid="password-input"
          />
        </div>
        <ErrorMessage error={message} data-testid="login-error-message" />
        <SubmitButton data-testid="sign-in-button" className="w-full mt-6">
          Sign in
        </SubmitButton>
      </form>
      <button
        type="button"
        onClick={() => setCurrentView(LOGIN_VIEW.FORGOT_PASSWORD)}
        className="text-center text-ui-fg-subtle text-small-regular mt-4 underline"
        data-testid="forgot-password-link"
      >
        Forgot your password?
      </button>
      <GoogleSignIn />
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        Not a member?{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.REGISTER)}
          className="underline"
          data-testid="register-button"
        >
          Join us
        </button>
        .
      </span>
      <div className="mt-8 w-full border-t border-ink-hairline pt-6 text-center">
        <p className="text-small-regular text-ui-fg-subtle">Running a store?</p>
        <LocalizedClientLink
          href="/seller"
          className="mt-2 inline-block text-small-regular underline"
          data-testid="seller-sign-in-link"
        >
          Sign in to Manage Business
        </LocalizedClientLink>
      </div>
    </div>
  )
}

export default Login
