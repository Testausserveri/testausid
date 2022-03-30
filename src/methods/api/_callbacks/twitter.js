const { updateAuthenticationSession } = require("../../../database/client")
const redirectWithCode = require("../../../util/redirectWithCode")
/* const { generateRandomString } = require("../../../util/generate")
const generateSignature1A = require("../../../util/generateSignature1A")
const getCredentials = require("../../../util/getCredentials") */
const request = require("../../../util/request")

// TODO:    This callback needs to be reworked. We need OAuth 2.0 to define scopes.
//          The only problem is that Twitter's docs are rather lacking and I
//          don't have the patience to implement scopes with trial and error.
//          Good luck to the next scrub who is gonna do that :p

/**
 * Twitter OAuth 1.0a callback
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {import("../../../typings/schemas").authenticationSession} session
 * @param {string} redirectURL
 */
module.exports = async (req, res, session) => {
    // Get request params
    const url = new URL(req.url, `http://${req.headers.host ?? "local"}`)
    const token = url.searchParams.get("oauth_token")
    if (!token) throw new Error("safe: Missing required data from the query. The user might have rejected the login request.")
    const verifier = url.searchParams.get("oauth_verifier")
    if (!verifier) throw new Error("safe: Missing required data from the query. The user might have rejected the login request.")

    // Fetch access token & general details
    const accessTokenRequest = await request("POST", `https://api.twitter.com/oauth/access_token?oauth_token=${token}&oauth_verifier=${verifier}`)
    if (accessTokenRequest.status !== 200) throw new Error("safe: ")
    const data = new URLSearchParams(accessTokenRequest.data)
    // const accessToken = data.get("oauth_token")
    const id = data.get("user_id")
    const name = data.get("screen_name")
    if (!id || !name) throw new Error("Unexpected response from Twitter")

    /* // Get user info
    const params = new URLSearchParams()
    // Request specific stuff
    if (session.scopes.includes("contact")) params.append("include_email", "true")
    else params.append("include_email", "false")
    params.append("include_entities", "true")
    params.append("skip_status", "true")
    // Authentication
    params.append("oauth_consumer_key", getCredentials("Twitter", "apiKey"))
    params.append("oauth_token", accessToken)
    // Signature
    const signatureConstruct = generateSignature1A(
        "GET", "https://api.twitter.com/1.1/account/verify_credentials.json", params, getCredentials("Twitter", "secret"), token
    )
    const onlyOAuthParams = Array.from(signatureConstruct.params.keys())
        .map((key) => (key.startsWith("oauth_") ? key : undefined))
        .filter((key) => key !== undefined)
    const noOAuthParams = Array.from(signatureConstruct.params.keys())
        .filter((key) => !onlyOAuthParams.includes(key))
    const headerParams = new URLSearchParams()
    const bodyParams = new URLSearchParams()
    for (const param of onlyOAuthParams) headerParams.set(param, signatureConstruct.params.get(param))
    for (const param of noOAuthParams) bodyParams.set(param, signatureConstruct.params.get(param))

    const user = await request(
        "GET", "https://api.twitter.com/1.1/account/verify_credentials.json", {
            Authorization: `OAuth ${`${headerParams.toString().replace(/&/g, ", ").replace(/=/g, "=\"").replace(/,/g, "\",")}"`}`
        }, bodyParams.toString()
    )
    console.debug("PARAMS", `OAuth ${`${headerParams.toString().replace(/&/g, ", ").replace(/=/g, "=\"").replace(/,/g, "\",")}"`}`)
    console.debug("BODY", bodyParams.toString())
    console.debug("USER", user)
    if (user.status !== 200) throw new Error("safe: Unable to access Twitter account information") */

    await updateAuthenticationSession({ internalState: session.internalState }, {
        user: {
            name,
            id
        }
    })

    // Redirect to application
    redirectWithCode(session, res)
}
