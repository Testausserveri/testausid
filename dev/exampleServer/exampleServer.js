const http = require("http")

// General configuration
const clientId = "29009777875350578869462533326609160110"
const redirectUri = "http://localhost:80/callback"
const secret = "b565ec644837c91f28e0948342ac1945c6a5aa93803d0cc71cdc00a83f7dedb9"
const scopes = "id,account,contact,security"
const OAuthHost = "http://localhost:8080"
const port = 80

/**
 * @typedef {object} RequestResponse A request response
 * @property {number} status Response status code
 * @property {string} data Response body
 * @property {http.IncomingHttpHeaders} headers Response headers
 */

/**
 * Make a simple HTTPS request
 * @param {string} method The request method
 * @param {string} url The request url
 * @param {string} body The request body
 * @returns {Promise<RequestResponse>}
 */
async function request(
    method, url, headers, body
) {
    return new Promise((resolve) => {
        const req = http.request({
            path: new URL(url).pathname + (url.includes("?") ? `?${url.split("?")[1]}` : ""),
            method,
            host: new URL(url).hostname,
            port: new URL(url).port
        }, (res) => {
            const d = []
            res.on("data", (buffer) => {
                d.push(buffer)
            })
            res.on("end", async () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    data: Buffer.concat(d).toString()
                })
            })
        })
        if (headers) {
            // eslint-disable-next-line guard-for-in
            for (const header in headers) {
                req.setHeader(header, headers[header])
            }
        }
        if (req.method !== "GET" && body) {
            req.write(body)
        }
        req.end()
    })
}

const Server = http.createServer(async (req, res) => { // Create a simple HTTP server
    if (req.url === "/") { // In the / url, we respond with a login link to Testausserveri ID
        res.writeHead(200, {
            "Content-Type": "text/html"
        })
        res.write(`
            <h1>Testausserveri ID's server-side authorization code grant implementation example</h1>
            <p>Click the link below to begin the authentication flow</p>
            <h3>
                <!-- Login link below, values from configuration at the top of the server file -->
                <a href='${OAuthHost}/api/v1/authenticate?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&response_type=code'>Login with Testausserveri ID</a>
                <br>
                <a href='/requestTokenFlow'>Login with Testausserveri ID with predefined methods & scopes</a>
            </h3>
        `)
    } else if (req.url.startsWith("/callback")) { // In the /callback url, we handle a redirection after a successful login
        try {
            const url = new URL(req.url, `http://${req.headers.host}/`)
            const code = url.searchParams.get("code") // The code query parameter is our one-time key to get ourselves and access token
            // We construct a HTTP POST request with the request body containing data encoded in application/x-www-form-urlencoded
            const tokenParams = new URLSearchParams()
            tokenParams.append("client_id", clientId) // Constant
            tokenParams.append("client_secret", secret) // Constant
            tokenParams.append("grant_type", "authorization_code") // Constant
            tokenParams.append("code", code) // The one-time key from the redirection
            tokenParams.append("redirect_uri", redirectUri) // Constant
            const token = await request(
                "POST", `${OAuthHost}/api/v1/token`, {
                    "Content-Type": "application/x-www-form-urlencoded"
                }, tokenParams.toString()
            )
            if (token.status !== 200) throw new Error("Failed to fetch token", token)
            // We get a response as JSON. Next we will read the user's information from the OAuth server at /api/v1/me
            const tokenData = JSON.parse(token.data)
            const me = await request("GET", `${OAuthHost}/api/v1/me`, {
                Authorization: `Bearer ${tokenData.token}`
            })
            if (me.status !== 200) throw new Error("Failed to fetch user data", me)
            // We get the user info as
            const userData = JSON.parse(me.data)
            res.writeHead(200, {
                "Content-Type": "text/html"
            })
            // Here we just dump the user info to the server response, you may use it how you please.
            res.write(`
                <h1>You are now logged in!</h1>
                <h2>User information</h2>
                <p>${JSON.stringify(userData, null, 2)}</p>
                <p>
                    <a href='/'>Return to homepage</a>
                </p>
            `)
        } catch (e) {
            // Handle an unexpected server error
            console.error("Callback error", e)
            if (!res.headersSent && res.writable) {
                res.writeHead(500, {
                    "Content-Type": "text/html"
                })
                res.write(`
                    <h1>Unexpected server error</h1>
                    <h3>More details in the console</h3>
                    <br>
                    <h3>
                        <a href='/'>Return to homepage</a>
                    </h3>
                `)
            }
        }
    } else if (req.url.startsWith("/requestTokenFlow")) { // Make a request beforehand the authentication to set allowed methods and force scopes
        // Create request params
        const params = new URLSearchParams()
        params.set("redirect_uri", redirectUri)
        params.set("scope", scopes)
        // Discord & Twitter, get list of method IDs with /api/v1/methods
        params.set("methods", "2db260c7-8ca9-42a3-8de8-a6a3c37be89e,ba8aad4d-9014-4ecc-9df3-e2d520b4c23e")
        const tokenRequest = await request("POST", `${OAuthHost}/api/v1/request_token`, {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/x-www-form-urlencoded"
        }, params.toString())
        if (tokenRequest.status !== 200) {
            console.error("Failed to get request token: ", tokenRequest.data.toString())
            res.writeHead(400)
            res.write("Unable get create request token. More information in the server console.")
        } else {
            // Redirect with the oauth token
            res.writeHead(307, {
                Location: `${OAuthHost}/api/v1/authenticate?oauth_token=${JSON.parse(tokenRequest.data.toString()).oauth_token}`
            })
            res.write("Redirecting...")
        }
    }

    if (!res.headersSent) { // Not found error message
        res.writeHead(404)
        res.write("Not found.")
    }

    res.end() // End the response
})

Server.listen(port, async () => { // Start the server
    console.log(`Example online at http://127.0.0.1:${port}/`)
})
