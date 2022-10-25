/**
 * API details method
 */
module.exports = {
    // eslint-disable-next-line no-useless-escape
    path: "^\/api\/$|^\/api$", // RegEx or a normal string
    /**
     * Method handler function
     * @param {import("http").IncomingMessage} req
     * @param {import("http").ServerResponse} res
     * @param {function} next
     */
    handler: async (_, res) => {
        res.writeHead(200, {
            "Content-Type": "application/json"
        })
        res.end(JSON.stringify({
            latest: "v2-partial, v1",
            available: [
                "GET /api/v1/authenticate",
                "POST /api/v1/token",
                "GET /api/v1/application",
                "GET /api/v1/methods",
                "GET /api/v1/login",
                "GET /api/v1/callback",
                "GET /api/v1/me",
                "POST /api/v2/request_token",
                "POST /api/v2/authenticate"
            ]
        }))
    }
}
