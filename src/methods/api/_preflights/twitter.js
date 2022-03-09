const getCredentials = require("../../../util/getCredentials")
const request = require("../../../util/request")
const generateSignature1A = require("../../../util/generateSignature1A")

/**
 * Twitter OAuth 1.0a preflight
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {import("../../../typings/schemas").authenticationSession} session
 * @param {string} redirectURL
 * @param {import("../../../typings/schemas")} method
 */
module.exports = async (
    _, res, session, redirectURL, method
) => {
    // Create query params
    const params = new URLSearchParams()
    params.append("oauth_consumer_key", getCredentials("Twitter", "apiKey"))
    params.append("oauth_callback", `${redirectURL}?state=${session.internalState}`)

    // Generate params' signature
    const signatureConstruct = generateSignature1A(
        "POST", "https://api.twitter.com/oauth/request_token", params, getCredentials("Twitter", "apiKeySecret"), ""
    )
    signatureConstruct.params.append("oauth_signature", signatureConstruct.signature)

    // Make the preflight request
    const firstStep = await request("POST", "https://api.twitter.com/oauth/request_token", {
        Authorization: `OAuth ${signatureConstruct.params.toString().replace(/&/g, "\", ").replace(/=/g, "=\"")}"`,
        "Content-Type": "request"
    })
    if (firstStep.status !== 200) throw new Error("safe: Unable to initialize authorization flow. This is likely a Twitter issue.")
    // Redirect user to login
    const location = method.url
        // eslint-disable-next-line no-template-curly-in-string
        .replace("${oauthToken}", new URLSearchParams(firstStep.data).get("oauth_token"))
    res.writeHead(307, {
        Location: location,
        "Content-Type": "text/html"
    })
    res.end(`
        If you are not redirected, click <a href="${location}">here</a>.
        <br>
        <i>(${location})</i>
    `)
}
