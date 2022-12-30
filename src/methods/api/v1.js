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
const handleError = require("../../util/handleError")
const getBody = require("../../util/getBody")
const parseFormUrlEncoded = require("../../util/parseFormUrlEncoded")

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

        // Handle POST requests
        if (req.method === "POST") {
            if (url.pathname === "/api/v1/token") { // Exchange code for token
                // Get input params
                if (req.headers["content-type"] !== "application/x-www-form-urlencoded") {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    return res.end(JSON.stringify({
                        error: "Invalid content-type header"
                    }))
                }

                // Get the request body
                const body = await getBody(req)

                // Parse params
                const requestParams = parseFormUrlEncoded(body)

                if (!requestParams) {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    return res.end(JSON.stringify({
                        error: "Invalid form body"
                    }))
                }

                // Get all given inputs
                const code = requestParams.get("code") ?? ""
                const grantType = requestParams.get("grant_type") ?? ""
                const redirectURI = requestParams.get("redirect_uri") ?? ""
                const clientId = requestParams.get("client_id") ?? ""
                const clientSecret = requestParams.get("client_secret") ?? ""

                // Make sure we got everything
                const requiredKeys = ["code", "grant_type", "redirect_uri", "client_id", "client_secret"]
                if (requiredKeys.map((key) => requestParams.has(key)).includes(false)) {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    return res.end(JSON.stringify({
                        error: `Missing or empty query parameter(s): ${requiredKeys.filter((key) => !requestParams.has(key))}`
                    }))
                }

                // Validate grant type
                if (grantType !== "authorization_code") {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    return res.end(JSON.stringify({
                        error: "\"grant_type\" must be \"authorization_code\""
                    }))
                }

                // Process the token request
                try {
                    const application = await getApplication(clientId)

                    // Make sure the application credentials are valid
                    if (application === null || application.secret !== clientSecret) {
                        res.writeHead(401, {
                            "Content-Type": "application/json"
                        })
                        return res.end(JSON.stringify({
                            error: "Invalid client credentials"
                        }))
                    }

                    // Make sure the redirect url is valid
                    if (!application.redirectURLs.includes(redirectURI)) {
                        res.writeHead(401, {
                            "Content-Type": "application/json"
                        })
                        return res.end(JSON.stringify({
                            error: "Invalid redirect_uri"
                        }))
                    }

                    // Get authentication session
                    const session = await getAuthenticationSession({ code })
                    if (!session) {
                        res.writeHead(404, {
                            "Content-Type": "application/json"
                        })
                        return res.end(JSON.stringify({
                            error: "Invalid or expired code"
                        }))
                    }

                    // Make sure we are in the desired stage
                    if (session.status !== "completed") {
                        res.writeHead(404, {
                            "Content-Type": "application/json"
                        })
                        return res.end(JSON.stringify({
                            error: "Invalid or expired authentication session"
                        }))
                    }

                    // Update session details
                    const token = generateRandomString(32)
                    await updateAuthenticationSession({ code }, {
                        status: "stored",
                        timestamp: new Date().getTime(),
                        token
                    })

                    // Return the token
                    res.writeHead(200, {
                        "Content-Type": "application/json"
                    })
                    return res.end(JSON.stringify({
                        token,
                        expiry: expiryForStatuses.stored
                    }))
                } catch (e) {
                    console.error("Token", e)
                    return handleError(e, res)
                }
            }

            // No method matches this POST request
            return next()
        }

        // Handle GET requests
        if (req.method === "GET") {
            // Get application branding information
            if (url.pathname === "/api/v1/application") {
                const applicationId = url.searchParams.get("client_id")
                let application = await getApplication(applicationId)
                if (application === null) application = {}
                res.writeHead(200, {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                })
                return res.end(JSON.stringify({
                    id: application.id,
                    name: application.name,
                    icon: application.icon,
                    homepage: application.homepage
                }))
            }

            // Get available login methods
            if (url.pathname === "/api/v1/methods") {
                res.writeHead(200, {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                })
                return res.end(JSON.stringify(methods.map((method) => ({
                    name: method.prettyName ?? method.name,
                    id: method.id,
                    icon: method.icon
                }))))
            }

            // Start authentication session
            if (url.pathname === "/api/v1/authenticate") {
                // Get configuration
                const applicationId = url.searchParams.get("client_id") ?? ""
                const redirectURL = decodeURIComponent(url.searchParams.get("redirect_uri") ?? "")
                const state = url.searchParams.get("state")
                const scopes = (url.searchParams.get("scope") ?? "").split(",") // Comma separated
                const responseType = url.searchParams.get("response_type")

                // Verify configuration
                if (responseType !== "code") { // Only code is allowed
                    res.writeHead(400, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    })
                    return res.end(JSON.stringify({
                        error: "Only accepted response_type is \"code\""
                    }))
                }
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
                if (url.searchParams.get("response_type") === "token" && scopes.includes("token")) { // For now the token scope is not allowed with token auth
                    res.writeHead(401, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    })
                    return res.end(JSON.stringify({
                        error: "\"token\" is scope cannot be used with \"response_type\" as \"token\""
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
                    console.error("Authenticate", e)
                    return handleError(e, res, true)
                }
            }

            // Redirect user to oauth login
            if (url.pathname === "/api/v1/login") {
                // Verify required parameters exist
                const redirectId = url.searchParams.get("state") ?? ""
                if (redirectId === "") {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    return res.end(JSON.stringify({
                        error: "\"state\" is required"
                    }))
                }

                // Get the desired authentication method's information
                const method = url.searchParams.get("method") ?? "" // This is the method id
                if (method === "") {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    return res.end(JSON.stringify({
                        error: "\"method\" is required"
                    }))
                }
                const methodObject = resolveFromObject("id", method, methods)
                if (methodObject === undefined) {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    return res.end(JSON.stringify({
                        error: "\"method\" is invalid"
                    }))
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
                        return res.end(JSON.stringify({
                            error: "Invalid or expired authentication session"
                        }))
                    }
                    // Make sure we are using an allowed method
                    if (session.allowedMethods[0] !== "*" && !session.allowedMethods.includes(method)) {
                        res.writeHead(401, {
                            "Content-Type": "application/json"
                        })
                        return res.end(JSON.stringify({
                            error: "Method not accepted"
                        }))
                    }

                    // Update session details
                    await updateAuthenticationSession({ redirectId }, {
                        status: "pending",
                        authenticationPlatform: methodObject.id,
                        timestamp: new Date().getTime()
                    })

                    // Check for preflight
                    if (preflights[methodObject.name.toLowerCase()] !== undefined) {
                        // Preflight takes over the request here
                        return await preflights[methodObject.name.toLowerCase()](
                            req, res, session, redirectUrl, methodObject
                        )
                    }

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
                    return res.end(`
                            <header>
                                <title>Redirecting...</title>
                            </header>
                            <body>
                                If you are not redirected, click <a href="${location}">here</a>.
                                <br>
                                <i>(${location})</i>
                            </body>
                        `)
                } catch (e) {
                    console.error("Login", e)
                    return handleError(e, res)
                }
            }

            // Callback from oauth login
            if (url.pathname === "/api/v1/callback") {
                // Make sure we have the state
                const internalState = url.searchParams.get("state") ?? ""
                if (internalState === "") {
                    res.writeHead(400, {
                        "Content-Type": "application/json"
                    })
                    return res.end(JSON.stringify({
                        error: "\"state\" is required"
                    }))
                }
                // Verify session
                const session = await getAuthenticationSession({ internalState })

                // Make sure we are in the desired stage
                if (session?.status !== "pending") {
                    res.writeHead(401, {
                        "Content-Type": "application/json"
                    })
                    return res.end(JSON.stringify({
                        error: "Invalid or expired authentication session"
                    }))
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
                    return await callbacks[method.toLowerCase()](
                        req, res, session, redirectUrl
                    )
                } catch (e) {
                    console.error("Callback", e)
                    handleError(e, res)
                }
            }

            // Get user info with token
            if (url.pathname === "/api/v1/me") {
                // Get token and verify it
                const token = req.headers.authorization ?? ""
                if (token === "") { // Has to be present
                    res.writeHead(400, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    })
                    return res.end(JSON.stringify({
                        error: "Authorization header empty or not present"
                    }))
                }
                if (!token.startsWith("Bearer ")) { // Has to be type of bearer
                    res.writeHead(400, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    })
                    return res.end(JSON.stringify({
                        error: "Authorization must be type of \"Bearer\""
                    }))
                }

                try {
                    // Get the authentication session
                    const session = await getAuthenticationSession({ token: token.replace("Bearer ", "") })
                    if (!session) {
                        res.writeHead(401, {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*"
                        })
                        return res.end(JSON.stringify({
                            error: "Invalid token"
                        }))
                    }

                    // Make sure we are in the desired stage
                    if (session.status !== "stored") {
                        res.writeHead(401, {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*"
                        })
                        return res.end(JSON.stringify({
                            error: "Invalid or expired authentication session"
                        }))
                    }

                    // Remove session from database
                    await removeAuthenticationSession({ internalState: session.internalState })

                    // Respond with user information
                    res.writeHead(200, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    })
                    return res.end(JSON.stringify({
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
                    return handleError(e, res, true)
                }
            }

            // No method matched this GET request
            return next()
        }

        // Handle POST requests
        if (req.method === "OPTIONS") {
            if (url.pathname === "/api/v1/me") { // CORS requires this
                res.writeHead(200, {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "authorization"
                })
                return res.end()
            }

            // No method matched this OPTIONS request
            return next()
        }

        // No method matched this endpoint
        return next()
    }
}
