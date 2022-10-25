const { getApplication, createAuthenticationSession } = require("../../../database/client")
const { generateRandomString } = require("../../../util/generate")
const resolveFromObject = require("../../../util/resolveFromObject")
const methods = require("../../../methods.json")
const handleError = require("../../../util/handleError")
const getBody = require("../../../util/getBody")
const parseFormUrlEncoded = require("../../../util/parseFormUrlEncoded")
const enforceMethod = require("../../../util/enforceMethod")

/**
 * API V2
 */
module.exports = {
    path: "/api/v2/request_token", // RegEx or a normal string
    /**
     * Method handler function
     * @param {import("http").IncomingMessage} req
     * @param {import("http").ServerResponse} res
     * @param {function} next
     */
    handler: async (req, res) => {
        // Only allow POST
        if (!enforceMethod("POST", req)) {
            res.writeHead(405)
            return res.end("Method not allowed")
        }

        // Verify client authorization
        const token = req.headers?.authorization ?? ""
        if (token === "") { // Make sure token is present
            res.writeHead(400, {
                "Content-Type": "application/json"
            })
            return res.end(JSON.stringify({
                error: "Missing or invalid authorization header"
            }))
        }
        if (!token.startsWith("Bearer")) { // Make sure the token is the correct type
            res.writeHead(400, {
                "Content-Type": "application/json"
            })
            return res.end(JSON.stringify({
                error: "Authorization must be type of \"Bearer\""
            }))
        }
        const application = await getApplication({ secret: token.replace("Bearer ", "") })
        if (!application) { // Make sure the token is valid
            res.writeHead(401, {
                "Content-Type": "application/json"
            })
            return res.end(JSON.stringify({
                error: "Invalid token"
            }))
        }

        // Make sure the content-type header is correct
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

        // Parse the request body
        const requestParams = parseFormUrlEncoded(body)
        if (!requestParams) {
            res.writeHead(400, {
                "Content-Type": "application/json"
            })
            return res.end(JSON.stringify({
                error: "Invalid request body"
            }))
        }

        const redirectURL = decodeURIComponent(requestParams.get("redirect_uri") ?? "")
        const state = requestParams.get("state")
        const scopes = (requestParams.get("scope") ?? "").split(",") // Comma separated list
        const allowedMethods = (requestParams.get("methods") ?? "").split(",") // Comma separated list

        // Verify given session configuration
        if (!application.redirectURLs.includes(redirectURL)) { // redirectURL must be valid
            res.writeHead(400, {
                "Content-Type": "application/json"
            })
            return res.end(JSON.stringify({
                error: "Invalid redirect_uri"
            }))
        }
        if (scopes.length < 1) { // There must be scope(s)
            res.writeHead(400, {
                "Content-Type": "application/json"
            })
            return res.end(JSON.stringify({
                error: "At least one scope required"
            }))
        }
        if (allowedMethods.length < 1) { // There must be method(s)
            res.writeHead(400, {
                "Content-Type": "application/json"
            })
            return res.end(JSON.stringify({
                error: "At least one method required"
            }))
        }
        if (allowedMethods // All methods must be valid
            .map((method) => resolveFromObject("id", method, methods))
            .filter((result) => !result).length !== 0
        ) {
            res.writeHead(400, {
                "Content-Type": "application/json"
            })
            return res.end(JSON.stringify({
                error: "One or more provided method IDs are invalid"
            }))
        }

        // Generate identifiers for the authentication session and the redirect
        const internalState = generateRandomString(32)
        const redirectId = generateRandomString(16)
        const oauthToken = generateRandomString(16)

        try {
            // Create the authentication session
            await createAuthenticationSession(
                application.id, scopes, redirectURL, state, internalState, redirectId, oauthToken, allowedMethods
            )

            // Redirect user to login
            res.writeHead(200, {
                "Content-Type": "application/json"
            })
            return res.end(JSON.stringify({
                oauth_token: oauthToken
            }))
        } catch (e) {
            console.error("Request token", e)
            return handleError(e, res)
        }
    }
}
