const getCredentials = require("../../../util/getCredentials")
const callbackRedirect = require("../../../util/callbackRedirect")
const { updateAuthenticationSession } = require("../../../database/client")
const request = require("../../../util/request")

/**
 * Wilma Plus OAuth 2.0 callback
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {import("../../../typings/schemas").authenticationSession} session
 * @param {string} redirectURL
 */
module.exports = async (
    req, res, session, redirectURL
) => {
    // Get request params
    const url = new URL(req.url, `http://${req.headers.host ?? "local"}`)
    const code = url.searchParams.get("code")
    if (!code) throw new Error("safe: Missing code from query. The user might have rejected the login request.")

    // Construct access token request params
    const tokenExchangeParams = new URLSearchParams()
    tokenExchangeParams.append("client_id", getCredentials("WilmaPlus", "clientId"))
    tokenExchangeParams.append("client_secret", getCredentials("WilmaPlus", "secret"))
    tokenExchangeParams.append("grant_type", "authorization_code")
    tokenExchangeParams.append("code", code)
    tokenExchangeParams.append("redirect_uri", redirectURL)

    // Make the request for the access token
    const tokenExchange = await request(
        "POST", "https://tunnistautuminen.wilmaplus.fi/oauth/token", {
            "Content-Type": "application/x-www-form-urlencoded"
        }, tokenExchangeParams.toString()
    )
    if (tokenExchange.status !== 200) throw new Error("safe: Unable to request account access token. This is likely a Wilma Plus issue.")
    const token = JSON.parse(tokenExchange.data).access_token

    // Fetch data based on request scopes
    const info = await request("GET", `https://tunnistautuminen.wilmaplus.fi/oauth/userinfo?access_token=${token}`)
    if (info.status !== 200) throw new Error("safe: Unable to access account information. This is likely a Wilma Plus issue.")
    const userData = JSON.parse(info.data)

    // Update authentication session information based on scopes
    await updateAuthenticationSession({ internalState: session.internalState }, {
        user: {
            name: userData.name,
            id: userData.sub,
            token: session.scopes.includes("token") ? token : null,
            contact: session.scopes.includes("contact") ? ({
                email: userData.email,
                phone: null
            }) : null,
            account: session.scopes.includes("account") ? ({
                avatar: userData.picture
            }) : null
        }
    })

    // Redirect to application
    await callbackRedirect(session, res)
}
