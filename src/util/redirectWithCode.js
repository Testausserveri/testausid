const { ServerResponse } = require("http")

/**
 * Redirect back to the application of origin
 * @param {import("../typings/schemas").authenticationSession} session
 * @param {import("http").ServerResponse} res
 */
module.exports = (session, res) => {
    // Validate session
    if (session.status !== "completed") throw new Error("Session status property must be \"completed\"")
    if (!session.redirectURL || !session.code) throw new Error("Invalid session")
    if (!(res instanceof ServerResponse)) throw new Error("Invalid response")

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
