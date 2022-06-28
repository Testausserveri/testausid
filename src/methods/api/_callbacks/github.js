const getCredentials = require("../../../util/getCredentials")
const { updateAuthenticationSession } = require("../../../database/client")
const request = require("../../../util/request")
const callbackRedirect = require("../../../util/callbackRedirect")

/**
 * Github OAuth 2.0 callback
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
    tokenExchangeParams.append("client_id", getCredentials("github", "clientId"))
    tokenExchangeParams.append("client_secret", getCredentials("github", "secret"))
    tokenExchangeParams.append("code", code)
    tokenExchangeParams.append("redirect_url", redirectURL)

    // Make the request for the access token
    const tokenExchange = await request(
        "POST", "https://github.com/login/oauth/access_token", {}, tokenExchangeParams.toString()
    )
    if (tokenExchange.status !== 200) throw new Error("safe: Unable to get account access token. The user may have rejected the authentication request.")
    const token = new URLSearchParams(tokenExchange.data).get("access_token")

    // Request user information
    const user = await request("GET", "https://api.github.com/user", {
        Authorization: `token ${token}`,
        "User-agent": "NodeJS-HTTP" // Has to be set on Github API GET requests (to something)
    })
    if (user.status !== 200) throw new Error("safe: Unable to get account information.")
    const userInfo = JSON.parse(user.data)

    // Update authentication session information based on scopes
    await updateAuthenticationSession({ internalState: session.internalState }, {
        user: {
            name: session.scopes.includes("account") ? userInfo.login : null,
            id: userInfo.id,
            token: session.scopes.includes("token") ? token : null,
            contact: session.scopes.includes("contact") ? ({
                email: userInfo.email
            }) : null,
            account: session.scopes.includes("account") ? ({
                avatar: userInfo.avatar_url,
                createdAt: userInfo.created_at
            }) : null,
            security: session.scopes.includes("security") ? ({
                has2FA: userInfo.two_factor_authentication
            }) : null
        }
    })

    // Redirect to application
    await callbackRedirect(session, res)
}
