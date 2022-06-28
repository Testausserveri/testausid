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
 * @param {Boolean} noCors Should we disable cors?
 */
async function handleError(err, res, noCors) {
    if (err.toString().replace("Error: ", "").startsWith("safe: ")) {
        res.writeHead(400, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": noCors ? "*" : "testausserveri.fi"
        })
        res.end(JSON.stringify({
            error: err.toString().replace("safe: ", "")
        }))
    } else {
        res.writeHead(500, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": noCors ? "*" : "testausserveri.fi"
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
            } else if (url.pathname === "/api/v1/request_token") { // Backend begins authentication session flow
                // Verify client authorization
                const token = req.headers?.authorization ?? ""
                if (token === "") {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "Missing or invalid authorization header"
                    }))
                    return
                }
                if (!token.startsWith("Bearer")) {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "Authorization must be type of \"Bearer\""
                    }))
                    return
                }
                const application = await getApplication({ secret: token.replace("Bearer ", "") })
                if (!application) {
                    res.writeHead(401, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "Invalid token"
                    }))
                    return
                }

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
                const redirectURL = decodeURIComponent(searchParams.get("redirect_uri") ?? "")
                const state = searchParams.get("state")
                const scopes = (searchParams.get("scope") ?? "").split(",") // Comma separated
                const allowedMethods = (searchParams.get("methods") ?? "").split(",") // Comma separated

                // Verify configuration
                if (!application.redirectURLs.includes(redirectURL)) { // redirectURL must be valid
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "Invalid redirect_uri"
                    }))
                    return
                }
                if (scopes.length < 1) { // There must be scope(s)
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "At least one scope required"
                    }))
                    return
                }
                if (allowedMethods.length < 1) { // There must be method(s)
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "At least one method required"
                    }))
                    return
                }
                if (allowedMethods // All methods must be valid
                    .map((method) => resolveFromObject("id", method, methods))
                    .filter((result) => !result).length !== 0
                ) {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        error: "One or more provided method IDs are invalid"
                    }))
                    return
                }

                // Generate identifiers for the authentication session and the redirect
                const internalState = generateRandomString(32)
                const redirectId = generateRandomString(16)
                const oauthToken = generateRandomString(16)

                // Create the authentication session
                try {
                    await createAuthenticationSession(
                        application.id, scopes, redirectURL, state, internalState, redirectId, oauthToken, allowedMethods
                    )
                    // Redirect user to login
                    res.writeHead(200, {
                        "Content-Type": "application/json"
                    })
                    res.end(JSON.stringify({
                        oauth_token: oauthToken
                    }))
                } catch (e) {
                    console.error("Request_token", e)
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
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                })
                res.end(JSON.stringify({
                    id: application.id,
                    name: application.name,
                    icon: application.icon,
                    homepage: application.homepage
                }))
            } else if (url.pathname === "/api/v1/methods") { // Get login methods
                res.writeHead(200, {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                })
                res.end(JSON.stringify(methods.map((method) => ({
                    name: method.prettyName ?? method.name,
                    id: method.id,
                    icon: method.icon
                }))))
            } else if (url.pathname === "/api/v1/authenticate") { // Start authentication session
                // Check if we have a request token and that a session has already been created
                const oauthToken = url.searchParams.get("oauth_token") ?? ""
                if (oauthToken !== "") {
                    const predefinedSession = await getAuthenticationSession({ oauthToken })
                    if (!predefinedSession) {
                        res.writeHead(401, {
                            "Content-Type": "application/json"
                        })
                        res.end(JSON.stringify({
                            error: "Invalid or expired authentication session"
                        }))
                        return
                    }
                    // Redirect user to login
                    const query = `scopes=${predefinedSession.scopes.join(",")}
                        &client_id=${predefinedSession.applicationId}
                        &state=${predefinedSession.redirectId}
                        &redirect_uri=${predefinedSession.redirectURL}
                        &methods=${predefinedSession.allowedMethods.join(",")}`
                        .replace(/\n/g, "").replace(/ /g, "")
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
                    return
                }
                // --> Continue with normal OAuth 2.0 /authenticate flow

                // Get configuration
                const applicationId = url.searchParams.get("client_id") ?? ""
                const redirectURL = decodeURIComponent(url.searchParams.get("redirect_uri") ?? "")
                const state = url.searchParams.get("state")
                const scopes = (url.searchParams.get("scope") ?? "").split(",") // Comma separated
                const responseType = url.searchParams.get("response_type")

                // Verify configuration
                if (!["token", "code"].includes(responseType)) { // Only code & token  authentication is allowed
                    res.writeHead(400, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    })
                    res.end(JSON.stringify({
                        error: "Only accepted response_type is \"code\""
                    }))
                    return
                }
                if (scopes.length < 1) { // There has to be scopes
                    res.writeHead(400, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    })
                    res.end(JSON.stringify({
                        error: "At least one scope required"
                    }))
                    return
                }
                if (applicationId === "") { // Application id is required
                    res.writeHead(400, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    })
                    res.end(JSON.stringify({
                        error: "\"client_id\" is required"
                    }))
                    return
                }
                if (redirectURL === "") { // Redirect url is required
                    res.writeHead(400, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    })
                    res.end(JSON.stringify({
                        error: "\"redirect_uri\" is required"
                    }))
                    return
                }
                if (url.searchParams.get("response_type") === "token" && scopes.includes("token")) { // For now the token scope is not allowed with token auth
                    res.writeHead(401, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    })
                    res.end(JSON.stringify({
                        error: "\"token\" is scope cannot be used with \"response_type\" as \"token\""
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
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*"
                        })
                        res.end(JSON.stringify({
                            error: "Invalid client_id"
                        }))
                        return
                    }
                    if (!application.redirectURLs.includes(redirectURL)) {
                        res.writeHead(400, {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*"
                        })
                        res.end(JSON.stringify({
                            error: "Invalid redirect_uri"
                        }))
                        return
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
                    console.error("Authenticate", e)
                    handleError(e, res, true)
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
                    // Make sure we are using an allowed method
                    if (session.allowedMethods[0] !== "*" && !session.allowedMethods.includes(method)) {
                        res.writeHead(401, {
                            "Content-Type": "application/json"
                        })
                        res.end(JSON.stringify({
                            error: "Method not accepted"
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
                if (session?.status !== "pending") {
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
                    // Overwrite old values, so the session may be passed
                    // to the callback, without having to fetch it again
                    session.code = code
                    session.status = "completed"
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
                // Get token and verify it
                const token = req.headers.authorization ?? ""
                if (token === "") {
                    res.writeHead(400, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    })
                    res.end(JSON.stringify({
                        error: "Authorization header empty or not present"
                    }))
                    return
                }
                if (!token.startsWith("Bearer ")) {
                    res.writeHead(400, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
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
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*"
                        })
                        res.end(JSON.stringify({
                            error: "Invalid token"
                        }))
                        return
                    }
                    // Make sure we are in the desired stage
                    if (session.status !== "stored") {
                        res.writeHead(401, {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*"
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
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
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
                    handleError(e, res, true)
                }
            } else {
                next()
            }
        } else if (req.method === "OPTIONS") {
            if (url.pathname === "/api/v1/me") { // CORS requires this
                res.writeHead(200, {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "authorization"
                })
                res.end()
            }
        } else {
            next()
        }
    }
}
