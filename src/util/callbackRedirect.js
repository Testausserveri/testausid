const { ServerResponse } = require("http")
const { updateAuthenticationSession, expiryForStatuses } = require("../database/client")
const { generateRandomString } = require("./generate")
const handleError = require("./handleError")

/**
 * Redirect back to the application of origin
 * @param {import("../typings/schemas").authenticationSession} session
 * @param {import("http").ServerResponse} res
 */
module.exports = async (session, res) => {
    // Validate session
    if (session.status !== "completed") throw new Error("Session status property must be \"completed\"")
    if (!session.redirectURL || !session.code) throw new Error("Invalid session")
    if (!(res instanceof ServerResponse)) throw new Error("Invalid response")

    // Redirect to application
    const newLocation = new URL(session.redirectURL)
    if (session.responseType === "token") {
        // Update session details
        const token = generateRandomString(32)
        try {
            await updateAuthenticationSession({ internalState: session.internalState }, {
                status: "stored",
                timestamp: new Date().getTime(),
                token
            })
            newLocation.searchParams.set("token", token)
            newLocation.searchParams.set("expiry", expiryForStatuses.stored)
        } catch (e) {
            console.error("Callback redirect", e)
            return handleError(e, res)
        }
    } else if (session.responseType === "code") {
        newLocation.searchParams.set("code", session.code)
    }
    newLocation.searchParams.set("state", session.state)

    res.writeHead(307, {
        "Content-Type": "text/html",
        Location: newLocation.toString()
    })
    return res.end(`
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
