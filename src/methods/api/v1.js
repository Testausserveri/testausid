/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
const { readdirSync } = require("fs")
const {
    getApplication, createAuthenticationSession, updateAuthenticationSession, getAuthenticationSession, removeAuthenticationSession, expiryForStatuses
} = require("../../database/client")
const { generateRandomString } = require("../../util/generate")
const methods = require("../../methods.json")
const resolveFromObject = require("../../util/resolveFromObject")
const getScopes = require("../../util/getScopes")

// Get callbacks and preflights
const callbacks = Object.fromEntries(readdirSync("./src/methods/api/_callbacks")
    .filter((name) => name.endsWith(".js"))
    .map((name) => [name.replace(".js", "").toLowerCase(), require(`./_callbacks/${name}`)]))

const preflights = Object.fromEntries(readdirSync("./src/methods/api/_preflights/")
    .filter((name) => name.endsWith(".js"))
    .map((name) => [name.replace(".js", "").toLowerCase(), require(`./_preflights/${name}`)]))

// Redirect url
const redirectUrl = `${process.env.REDIRECTBASE ?? "http://localhost:7080"}/api/v1/callback`

/**
 * Handle server error
 * @param {Error} err
 * @param {import("http").ServerResponse} res
 */
async function handleError(err, res) {
    if (err.toString().replace("Error: ", "").startsWith("safe: ")) {
        res.writeHead(400, {
            "Content-Type": "application/json"
        })
        res.end(JSON.stringify({
            error: err.toString().replace("safe: ", "")
        }))
    } else {
        res.writeHead(500, {
            "Content-Type": "application/json"
        })
        res.end(JSON.stringify({
            error: "Unexpected internal server error"
        }))
    }
}

/**
 * Authentication API v1
 */
module.exports = {
    // eslint-disable-next-line no-useless-escape
    path: "\/api\/v1\/.{0,256}", // RegEx or a normal string
    /**
     * Method handler function
     * @param {import("http").IncomingMessage} req
     * @param {import("http").ServerResponse} res
     * @param {function} next
     */
    handler: async (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`)
        if (req.method === "POST") {
            if (url.pathname === "/api/v1/token") { // Exchange code for token
                // Get input params
                if (req.headers["content-type"] !== "application/x-www-form-urlencoded") {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "Invalid content-type header"
                    }))
                    return
                }

                // Get the request body
                const bodyBuffer = []
                req.on("data", (chunk) => bodyBuffer.push(chunk))
                await new Promise((resolve) => { req.on("end", resolve) })
                const body = Buffer.concat(bodyBuffer).toString()

                // Parse params
                let searchParams
                try {
                    searchParams = new URLSearchParams(body)
                } catch (e) {
                    console.error("SearchParams", e)
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "Invalid request body"
                    }))
                    return
                }

                // Get all given inputs
                const code = searchParams.get("code") ?? ""
                const grantType = searchParams.get("grant_type") ?? ""
                const redirectURI = searchParams.get("redirect_uri") ?? ""
                const clientId = searchParams.get("client_id") ?? ""
                const clientSecret = searchParams.get("client_secret") ?? ""

                // Make sure we got everything
                if (clientId === "" || clientSecret === "" || code === "" || redirectURI === "") {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "Missing or empty query parameters"
                    }))
                    return
                }
                // Validate grant type
                if (grantType !== "authorization_code") {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "\"authorization_code\" must be \"authorization_code\""
                    }))
                    return
                }

                // Process the token request
                try {
                    const application = await getApplication(clientId)
                    if (application === null || application.secret !== clientSecret) {
                        res.writeHead(401, {
                            "Content-Type": "application/json"
                        })
                        res.end(JSON.stringify({
                            error: "Invalid client credentials"
                        }))
                        return
                    }
                    if (!application.redirectURLs.includes(redirectURI)) {
                        res.writeHead(401, {
                            "Content-Type": "application/json"
                        })
                        res.end(JSON.stringify({
                            error: "Invalid redirect_uri"
                        }))
                        return
                    }
                    // Change state to stored
                    const session = await getAuthenticationSession({ code })
                    if (!session) {
                        res.writeHead(404, {
                            "Content-Type": "application/json"
                        })
                        res.end(JSON.stringify({
                            error: "Invalid or expired code"
                        }))
                        return
                    }
                    // Make sure we are in the desired stage
                    if (session.status !== "completed") {
                        res.writeHead(404, {
                            "Content-Type": "application/json"
                        })
                        res.end(JSON.stringify({
                            error: "Invalid or expired authentication session"
                        }))
                        return
                    }
                    // Return the token
                    const token = generateRandomString(32)
                    await updateAuthenticationSession({ code }, {
                        status: "stored",
                        timestamp: new Date().getTime(),
                        token
                    })
                    res.writeHead(200, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        token,
                        expiry: expiryForStatuses.stored
                    }))
                } catch (e) {
                    console.error("Token", e)
                    handleError(e, res)
                }
            } else {
                next()
            }
        } else if (req.method === "GET") {
            if (url.pathname === "/api/v1/application") { // Get application branding information
                const applicationId = url.searchParams.get("client_id")
                let application = await getApplication(applicationId)
                if (application === null) application = {}
                res.writeHead(200, {
                    "Content-Type": "application/json"
                })
                res.end(JSON.stringify({
                    id: application.id,
                    name: application.name,
                    icon: application.icon,
                    homepage: application.homepage
                }))
            } else if (url.pathname === "/api/v1/methods") { // Get login methods
                res.writeHead(200, {
                    "Content-Type": "application/json"
                })
                res.end(JSON.stringify(methods.map((method) => ({
                    name: method.name,
                    id: method.id,
                    icon: method.icon
                }))))
            } else if (url.pathname === "/api/v1/authenticate") { // Start authentication session
                // Only code authentication is allowed
                if (url.searchParams.get("response_type") !== "code") {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "Only accepted response_type is \"code\""
                    }))
                    return
                }

                // Get inputs
                const applicationId = url.searchParams.get("client_id") ?? ""
                const redirectURL = decodeURIComponent(url.searchParams.get("redirect_uri") ?? "")
                const state = url.searchParams.get("state")
                const scopes = (url.searchParams.get("scope") ?? "").split(",") // Comma separated

                // There has to be scopes
                if (scopes.length < 1 && scopes[0] === "") {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "Only accepted response_type is \"code\""
                    }))
                    return
                }
                // Application id is required
                if (applicationId === "") {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "\"client_id\" is required"
                    }))
                    return
                }
                // Redirect url is required
                if (redirectURL === "") {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "\"redirect_uri\" is required"
                    }))
                    return
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
                            "Content-Type": "application/json"
                        })
                        res.end(JSON.stringify({
                            error: "Invalid client_id"
                        }))
                        return
                    }
                    if (!application.redirectURLs.includes(redirectURL)) {
                        res.writeHead(400, {
                            "Content-Type": "application/json"
                        })
                        res.end(JSON.stringify({
                            error: "Invalid redirect_uri"
                        }))
                        return
                    }
                    // Create authentication session
                    await createAuthenticationSession(
                        applicationId, scopes, redirectURL, state, internalState, redirectId
                    )
                    // Redirect user to login
                    const query = `scopes=${scopes.join(",")}&client_id=${applicationId}&state=${redirectId}&redirect_uri=${redirectURL}`
                    res.writeHead(307, {
                        Location: `/app?${query}`,
                        "Content-Type": "text/html"
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
                    console.error("Authenticate", e)
                    handleError(e, res)
                }
            } else if (url.pathname === "/api/v1/login") { // Redirect user to oauth login
                // Verify required parameters exist
                const redirectId = url.searchParams.get("state") ?? ""
                if (redirectId === "") {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "\"state\" is required"
                    }))
                    return
                }
                // Get the desired authentication method's information
                const method = url.searchParams.get("method") ?? "" // This is the method id
                if (method === "") {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "\"method\" is required"
                    }))
                    return
                }
                const methodObject = resolveFromObject("id", method, methods)
                if (methodObject === undefined) {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "\"method\" is invalid"
                    }))
                    return
                }

                // Process the login redirect request
                try {
                    // Change authentication session stage
                    const session = await getAuthenticationSession({ redirectId })
                    // Make sure we are in the desired stage
                    if (session?.status !== "created") {
                        res.writeHead(401, {
                            "Content-Type": "application/json"
                        })
                        res.end(JSON.stringify({
                            error: "Invalid or expired authentication session"
                        }))
                        return
                    }
                    await updateAuthenticationSession({ redirectId }, {
                        status: "pending",
                        authenticationPlatform: methodObject.id,
                        timestamp: new Date().getTime()
                    })
                    // Check for preflight
                    if (preflights[methodObject.name.toLowerCase()] !== undefined) {
                        // Preflight takes over the request here
                        await preflights[methodObject.name.toLowerCase()](
                            req, res, session, redirectUrl, methodObject
                        )
                    } else {
                        // Construct the redirection URL and redirect the user
                        const location = methodObject.url
                            // eslint-disable-next-line no-template-curly-in-string
                            .replace("${state}", session.internalState)
                            // eslint-disable-next-line no-template-curly-in-string
                            .replace("${redirectURI}", redirectUrl)
                            // eslint-disable-next-line no-template-curly-in-string
                            .replace("${scopes}", getScopes(methodObject.name, session.scopes))
                            .split("${")
                            .map((part) => (part.startsWith("process.env.") ? part.replace(part.split("}")[0], process.env[part.split("}")[0].replace("process.env.", "")]).replace("}", "") : part))
                            .join("")
                        res.writeHead(307, {
                            Location: location,
                            "Content-Type": "text/html"
                        })
                        res.end(`
                            <header>
                                <title>Redirecting...</title>
                            </header>
                            <body>
                                If you are not redirected, click <a href="${location}">here</a>.
                                <br>
                                <i>(${location})</i>
                            </body>
                        `)
                    }
                } catch (e) {
                    console.error("Login", e)
                    handleError(e, res)
                }
            } else if (url.pathname === "/api/v1/callback") { // Callback from oauth login
                // Make sure we have the state
                const internalState = url.searchParams.get("state") ?? ""
                if (internalState === "") {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "\"state\" is required"
                    }))
                    return
                }
                // Verify session
                const session = await getAuthenticationSession({ internalState })
                // Make sure we are in the desired stage
                if (session.status !== "pending") {
                    res.writeHead(401, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "Invalid or expired authentication session"
                    }))
                    return
                }
                // Process the callback
                try {
                    // First set the session status
                    const code = generateRandomString(16)
                    await updateAuthenticationSession({ internalState }, {
                        status: "completed",
                        timestamp: new Date().getTime(),
                        code
                    })
                    session.code = code
                    // Send the request to the specific method callback handler
                    const method = resolveFromObject("id", session.authenticationPlatform, methods)?.name
                    if (!method) throw new Error("safe: Unknown callback method")
                    await callbacks[method.toLowerCase()](
                        req, res, session, redirectUrl
                    )
                } catch (e) {
                    console.error("Callback", e)
                    handleError(e, res)
                }
            } else if (url.pathname === "/api/v1/me") { // Get user info with token
                // Get token
                const token = req.headers.authorization
                if (!token.startsWith("Bearer ")) {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "Authorization must be type of \"Bearer\""
                    }))
                    return
                }
                try {
                    // Get the authentication session
                    const session = await getAuthenticationSession({ token: token.replace("Bearer ", "") })
                    if (!session) {
                        res.writeHead(401, {
                            "Content-Type": "application/json"
                        })
                        res.end(JSON.stringify({
                            error: "Invalid token"
                        }))
                        return
                    }
                    // Make sure we are in the desired stage
                    if (session.status !== "stored") {
                        res.writeHead(401, {
                            "Content-Type": "application/json"
                        })
                        res.end(JSON.stringify({
                            error: "Invalid or expired authentication session"
                        }))
                        return
                    }
                    // Remove session from database
                    await removeAuthenticationSession({ internalState: session.internalState })
                    // Respond with user information
                    res.writeHead(200, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        token: session.scopes.includes("token") ? session.user.token : undefined,
                        id: session.scopes.includes("id") ? session.user.id : undefined,
                        name: session.scopes.includes("account") ? session.user.name : undefined,
                        account: session.scopes.includes("account") ? session.user.account : undefined,
                        security: session.scopes.includes("security") ? session.user.security : undefined,
                        contact: session.scopes.includes("contact") ? session.user.contact : undefined,
                        scopes: session.scopes,
                        applicationId: session.applicationId,
                        platform: {
                            id: session.authenticationPlatform,
                            name: resolveFromObject("id", session.authenticationPlatform, methods)?.name
                        }
                    }))
                } catch (e) {
                    console.error("User", e)
                    handleError(e, res)
                }
            } else {
                next()
            }
        } else {
            next()
        }
    }
}
