const {
    getAuthenticationSession,
    getApplication,
    updateAuthenticationSession,
    expiryForStatuses
} = require("../../../database/client")
const { generateRandomString } = require("../../../util/generate")
const getBody = require("../../../util/getBody")
const handleError = require("../../../util/handleError")
const parseFormUrlEncoded = require("../../../util/parseFormUrlEncoded")

/**
 * Authenticate endpoint
 */
module.exports = {
    path: "/api/v3/authenticate", // RegEx or a normal string
    /**
     * Method handler function
     * @param {import("http").IncomingMessage} req
     * @param {import("http").ServerResponse} res
     * @param {function} next
     */
    handler: async (req, res, next) => {

        // Handle POST requests
        if (req.method === "POST") {
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
                    access_token: token, // Wow. All we needed.
                    expiry: expiryForStatuses.stored
                }))
            } catch (e) {
                console.error("Token", e)
                return handleError(e, res)
            }
        }

        // Handle POST requests
        if (req.method === "OPTIONS") {
            res.writeHead(200, {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "authorization"
            })
            return res.end()
        }

        // No method matched this endpoint
        return next()
    }
}
