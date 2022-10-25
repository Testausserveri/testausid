const getCredentials = require("../../../util/getCredentials")
const { updateAuthenticationSession } = require("../../../database/client")
const request = require("../../../util/request")
const callbackRedirect = require("../../../util/callbackRedirect")

/**
 * Google OAuth 2.0 callback
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {import("../../../typings/schemas").authenticationSession} session
 * @param {string} redirectURL
 */
module.exports = async (
    req, res, session, redirectURL
) => {
    // Get the authentication code
    const url = new URL(req.url, `http://${req.headers.host ?? "local"}`)
    const code = url.searchParams.get("code")

    // Construct token params
    const tokenExchangeParams = new URLSearchParams()
    tokenExchangeParams.append("client_id", getCredentials("google", "clientId"))
    tokenExchangeParams.append("client_secret", getCredentials("google", "secret"))
    tokenExchangeParams.append("code", code)
    tokenExchangeParams.append("redirect_uri", redirectURL)
    tokenExchangeParams.append("grant_type", "authorization_code")
    tokenExchangeParams.append("state", session.internalState)

    // Make the request for the access token
    const tokenExchange = await request(
        "POST", "https://oauth2.googleapis.com/token", {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "NodeJS-HTTP" // Has to be set on Google API GET requests (to something)
        }, tokenExchangeParams.toString()
    )
    if (tokenExchange.status !== 200) throw new Error("safe: Unable to get account access token. The user may have rejected the authentication request.")
    const tokenExchangeData = JSON.parse(tokenExchange.data)

    // Request user information
    const fields = []
    if (session.scopes.includes("account")) {
        fields.push(
            "name", "given_name", "picture", "locale", "createdAt"
        )
    }
    if (session.scopes.includes("contact")) fields.push("email", "emailVerified", "phoneNumber")
    if (session.scopes.includes("security")) fields.push("mfaInfo")
    const user = await request("GET", "https://www.googleapis.com/userinfo/v2/me", {
        Authorization: `${tokenExchangeData.token_type} ${tokenExchangeData.access_token}`,
        "User-agent": "NodeJS-HTTP" // Has to be set on Google API GET requests (to something)
    })
    if (user.status !== 200) throw new Error("safe: Unable to get account information.")
    const userInfo = JSON.parse(user.data)

    if (userInfo.hd !== "testausserveri.fi") throw new Error("safe: Selected account is not a member of the Testausserveri.fi organization.")

    // Update authentication session information based on scopes
    await updateAuthenticationSession({ internalState: session.internalState }, {
        user: {
            name: session.scopes.includes("account") ? userInfo.given_name ?? userInfo.name : null,
            id: session.scopes.includes("id") ? userInfo.id : null,
            token: session.scopes.includes("token") ? tokenExchangeData.access_token : null,
            account: session.scopes.includes("account") ? ({
                language: userInfo.locale,
                avatar: userInfo.picture
            }) : null,
            contact: session.scopes.includes("contact") ? ({
                email: userInfo.verified_email ? userInfo.email : null
            }) : null
        }
    })

    // Redirect to application
    await callbackRedirect(session, res)
}
