import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { completeKycLadder } from "./helpers/complete-kyc"

jest.setTimeout(120 * 1000)

const OWNER_EMAIL = "team-owner@howsu.local"
const OWNER_PASSWORD = "supersecret"
const MEMBER_EMAIL = "team-member@howsu.local"
const MEMBER_PASSWORD = "memberpass"

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer, dbUtils }) => {
    describe("Seller team invites", () => {
      let ownerToken: string

      it("onboards an owner store and an existing platform user", async () => {
        const register = await api.post("/auth/seller/emailpass/register", {
          email: OWNER_EMAIL,
          password: OWNER_PASSWORD,
        })
        expect(register.status).toEqual(200)

        await completeKycLadder(getContainer, OWNER_EMAIL, "+2349012340001")

        const created = await api.post(
          "/sellers",
          {
            name: "Team Store",
            handle: "team-store",
            admin: { email: OWNER_EMAIL, first_name: "Team", last_name: "Owner" },
          },
          { headers: { Authorization: `Bearer ${register.data.token}` } }
        )
        expect(created.status).toEqual(200)

        const login = await api.post("/auth/seller/emailpass", {
          email: OWNER_EMAIL,
          password: OWNER_PASSWORD,
        })
        ownerToken = login.data.token

        // The invitee is an EXISTING platform user with their own credentials.
        await api.post("/auth/customer/emailpass/register", {
          email: MEMBER_EMAIL,
          password: MEMBER_PASSWORD,
        })

        await dbUtils.snapshot()
      })

      it("lets the owner invite an existing user without provisioning a password", async () => {
        const invite = await api.post(
          "/sellers/team",
          { email: MEMBER_EMAIL },
          { headers: { Authorization: `Bearer ${ownerToken}` } }
        )
        expect(invite.status).toEqual(200)
        expect(invite.data.team_member).toMatchObject({ role: "staff", email: MEMBER_EMAIL })

        // The invited email is now a store identity — re-inviting is rejected.
        await expect(
          api.post(
            "/sellers/team",
            { email: MEMBER_EMAIL },
            { headers: { Authorization: `Bearer ${ownerToken}` } }
          )
        ).rejects.toMatchObject({ response: { status: 409 } })

        // Emails without an existing platform account cannot be invited.
        await expect(
          api.post(
            "/sellers/team",
            { email: "nobody@nowhere.test" },
            { headers: { Authorization: `Bearer ${ownerToken}` } }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        // The member signs in to /seller with the credentials they ALREADY own —
        // no new login is created by the invite.
        const memberLogin = await api.post("/auth/seller/emailpass", {
          email: MEMBER_EMAIL,
          password: MEMBER_PASSWORD,
        })
        expect(memberLogin.status).toEqual(200)

        const me = await api.get("/sellers/team", {
          headers: { Authorization: `Bearer ${memberLogin.data.token}` },
        })
        expect(me.status).toEqual(200)
        expect(me.data.team.find((m: any) => m.email === MEMBER_EMAIL)).toMatchObject({
          role: "staff",
        })

        // Staff members cannot manage the team — owner only.
        await expect(
          api.post(
            "/sellers/team",
            { email: "someone-else@howsu.local" },
            { headers: { Authorization: `Bearer ${memberLogin.data.token}` } }
          )
        ).rejects.toMatchObject({ response: { status: 401 } })
      })
    })
  },
})