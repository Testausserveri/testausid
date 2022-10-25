const { getAuthenticationSession, createAuthenticationSession, getApplication } = require("../../../database/client")
const enforceMethod = require("../../../util/enforceMethod")
const { generateRandomString } = require("../../../util/generate")
const handleError = require("../../../util/handleError")

/**
 * Authenticate endpoint
 */
module.exports = {
    path: "/api/v2/authenticate", // RegEx or a normal string
    /**
     * Method handler function
     * @param {import("http").IncomingMessage} req
     * @param {import("http").ServerResponse} res
     * @param {function} next
     */
    handler: async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`)

        // Only allow GET
        if (!enforceMethod("GET", req)) {
            res.writeHead(405)
            return res.end("Method not allowed")
        }

        // Check if we have a session configuration to use
        const oauthToken = url.searchParams.get("oauth_token") ?? ""
        if (oauthToken !== "") {
            const predefinedSession = await getAuthenticationSession({ oauthToken })
            if (!predefinedSession) { // Validate session
                res.writeHead(401, {
                    "Content-Type": "application/json"
                })
                return res.end(JSON.stringify({
                    error: "Invalid or expired authentication session"
                }))
            }

            // Redirect user to login
            const query = `scopes=${predefinedSession.scopes.join(",")}
                &client_id=${predefinedSession.applicationId}
                &state=${predefinedSession.redirectId}
                &redirect_uri=${predefinedSession.redirectURL}
                &methods=${predefinedSession.allowedMethods.join(",")}`
                .replace(/\n/g, "").replace(/ /g, "")

            res.writeHead(url.searchParams.has("noRedirect") ? 200 : 307, {
                [url.searchParams.has("noRedirect") ? "x-Location" : "Location"]: `/app?${query}`,
                "Content-Type": "text/html",
                "Access-Control-Allow-Origin": "*"
            })
            return res.end(`
                <header>
                    <title>Redirecting...</title>
                </header>
                <body>
                    If you are not redirected, click <a href="/app?${query}">here</a>.
                    <br>
                    <i>(/app?${query})</i>
                </body>
            `)
        }

        // Check if the client wants to use the implicit token grant (flow)
        if (url.searchParams.get("response_type") === "token") {
            // Get configuration
            const applicationId = url.searchParams.get("client_id") ?? ""
            const redirectURL = decodeURIComponent(url.searchParams.get("redirect_uri") ?? "")
            const state = url.searchParams.get("state")
            const scopes = (url.searchParams.get("scope") ?? "").split(",") // Comma separated
            const responseType = url.searchParams.get("response_type")

            // Verify configuration
            if (scopes.length < 1) { // There has to be scopes
                res.writeHead(400, {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                })
                return res.end(JSON.stringify({
                    error: "At least one scope required"
                }))
            }
            if (applicationId === "") { // Application id is required
                res.writeHead(400, {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                })
                return res.end(JSON.stringify({
                    error: "\"client_id\" is required"
                }))
            }
            if (redirectURL === "") { // Redirect url is required
                res.writeHead(400, {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                })
                return res.end(JSON.stringify({
                    error: "\"redirect_uri\" is required"
                }))
            }

            // Generate identifiers for the authentication session and the redirect
            const internalState = generateRandomString(32)
            const redirectId = generateRandomString(16)

            // Try to create session
            try {
                // Verify given information
                const application = await getApplication(applicationId)
                if (application === null) {
                    res.writeHead(400, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    })
                    return res.end(JSON.stringify({
                        error: "Invalid client_id"
                    }))
                }
                if (!application.redirectURLs.includes(redirectURL)) {
                    res.writeHead(400, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    })
                    return res.end(JSON.stringify({
                        error: "Invalid redirect_uri"
                    }))
                }
                // Create authentication session
                await createAuthenticationSession(
                    applicationId, scopes, redirectURL, state, internalState, redirectId, undefined, undefined, responseType
                )

                // Redirect user to login
                const query = `scopes=${scopes.join(",")}&client_id=${applicationId}&state=${redirectId}&redirect_uri=${redirectURL}`
                res.writeHead(url.searchParams.has("noRedirect") ? 200 : 307, {
                    [url.searchParams.has("noRedirect") ? "x-Location" : "Location"]: `/app?${query}`,
                    "Content-Type": "text/html",
                    "Access-Control-Allow-Origin": "*"
                })
                res.end(`
                    <header>
                        <title>Redirecting...</title>
                    </header>
                    <body>
                        If you are not redirected, click <a href="/app?${query}">here</a>.
                        <br>
                        <i>(/app?${query})</i>
                    </body>
                `)
            } catch (e) {
                console.error("Authenticate (v2)", e)
                return handleError(e, res, true)
            }
        } else if (url.searchParams.get("response_type") !== "code") {
            res.writeHead(400, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            })
            return res.end(JSON.stringify({
                error: "Unsupported \"response_type\". This API expects you to use \"token\" and unless that is given, the API redirects you to the v1 API, which expects type of \"code\"."
            }))
        }

        // Continue without a predefined session, fallback to v1 for now
        url.pathname = url.pathname.replace("v2", "v1")
        res.writeHead(307, {
            Location: url.toString()
        })
        return res.end()
    }
}
