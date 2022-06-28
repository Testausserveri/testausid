const { ServerResponse } = require("http")
const { generateRandomString } = require("./generate")
const { updateAuthenticationSession, expiryForStatuses } = require("../database/client")

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

    // Redirect to application with desired response_type
    if (session.responseType === "token") {
        // Return the token
        const token = generateRandomString(32)
        await updateAuthenticationSession({ id: session.id }, {
            status: "stored",
            timestamp: new Date().getTime(),
            token
        })
        const newLocation = new URL(session.redirectURL)
        newLocation.searchParams.set("token", token)
        newLocation.searchParams.set("state", session.state)
        newLocation.searchParams.set("token_type", "Bearer")
        newLocation.searchParams.set("expiry", expiryForStatuses.stored)
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
    } else {
        // Default to code
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
}
