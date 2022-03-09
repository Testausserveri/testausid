const { updateAuthenticationSession } = require("../../../database/client")
const getCredentials = require("../../../util/getCredentials")
const request = require("../../../util/request")

/**
 * Discord OAuth 2.0 callback
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {import("../../../typings/schemas").authenticationSession} session
 * @param {string} redirectURL
 */
module.exports = async (
    req, res, session, redirectURL
) => {
    // Get request params
    const url = new URL(req.url, `http://${req.headers.host}`)
    const code = url.searchParams.get("code")
    if (!code) throw new Error("safe: Missing code from query. The user might have rejected the login request.")

    // Construct access token request params
    const tokenExchangeParams = new URLSearchParams()
    tokenExchangeParams.append("client_id", getCredentials("Discord", "clientId"))
    tokenExchangeParams.append("client_secret", getCredentials("Discord", "secret"))
    tokenExchangeParams.append("grant_type", "authorization_code")
    tokenExchangeParams.append("code", code)
    tokenExchangeParams.append("redirect_uri", redirectURL)

    // Make the request for the access token
    const tokenExchange = await request(
        "POST", "https://discord.com/api/v9/oauth2/token", {
            "Content-Type": "application/x-www-form-urlencoded"
        }, tokenExchangeParams.toString()
    )
    if (tokenExchange.status !== 200) throw new Error("safe: Unable to request account access token. This is likely a Discord issue.")
    const token = JSON.parse(tokenExchange.data).access_token

    // Fetch data based on request scopes
    const info = await request("GET", "https://discord.com/api/v9/oauth2/@me", {
        Authorization: `Bearer ${token}`
    })
    if (info.status !== 200) throw new Error("safe: Unable to access account information. This is likely a Discord issue.")
    const userData = JSON.parse(info.data)

    // Update authentication session information based on scopes
    await updateAuthenticationSession({ internalState: session.internalState }, {
        user: {
            name: `${userData.user.username}#${userData.user.discriminator}`,
            id: userData.user.id,
            token: session.scopes.includes("token") ? token : null,
            contact: session.scopes.includes("contact") ? ({
                email: userData.user.email,
                phone: null
            }) : null,
            account: session.scopes.includes("account") ? ({
                avatar: `https://cdn.discordapp.com/avatars/${userData.user.id}/${userData.user.avatar}.webp`
            }) : null
        }
    })

    // Redirect to application
    const newLocation = new URL(session.redirectURL)
    newLocation.searchParams.set("code", session.code)
    newLocation.searchParams.set("state", session.state)
    res.writeHead(307, {
        "Content-Type": "text/html",
        Location: newLocation.toString()
    })
    res.end(`
        <header>
            <title>Redirecting...</title>
        </header>
        <body>
            If you are not redirected, click <a href="${newLocation.toString()}">here</a>.
            <br>
            <i>(${newLocation.toString()})</i>
        </body>
    `)
}
