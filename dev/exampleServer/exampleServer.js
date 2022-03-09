const http = require("http")

const clientId = "d3c89442d3574aa5bbaea011f2d43e14"
const redirectUri = "http://idexample.testausserveri.fi"
const secret = "572db82f6c93225138b12f4bc123f4031e1c48bf5abcd7aaa015135f14a549fe"
const scopes = "id,account,contact,security"

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
 * @returns {RequestResponse}
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

const Server = http.createServer(async (req, res) => {
    if (req.url === "/") {
        res.writeHead(200, {
            "Content-Type": "text/html"
        })
        res.write(`
            <h1>Testausserveri ID's server-side authorization code grant implementation example</h1>
            <p>Click the link below to begin the authentication flow</p>
            <h3>
                <a href='http://id.testausserveri.fi/api/v1/authenticate?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&response_type=code'>Login with Testausserveri ID</a>
            </h3>
        `)
    } else if (req.url.startsWith("/callback")) {
        try {
            const url = new URL(req.url, `http://${req.headers.host}/`)
            const code = url.searchParams.get("code")
            const tokenParams = new URLSearchParams()
            tokenParams.append("client_id", clientId)
            tokenParams.append("client_secret", secret)
            tokenParams.append("grant_type", "authorization_code")
            tokenParams.append("code", code)
            tokenParams.append("redirect_uri", redirectUri)
            const token = await request(
                "POST", "http://localhost:7080/api/v1/token", {
                    "Content-Type": "application/x-www-form-urlencoded"
                }, tokenParams.toString()
            )
            if (token.status !== 200) throw new Error("Failed to fetch token", token)
            const tokenData = JSON.parse(token.data)
            const me = await request("GET", "http://localhost:7080/api/v1/me", {
                Authorization: `Bearer ${tokenData.token}`
            })
            if (me.status !== 200) throw new Error("Failed to fetch user data", me)
            const userData = JSON.parse(me.data)
            res.writeHead(200, {
                "Content-Type": "text/html"
            })
            res.write(`
                <h1>You are now logged in!</h1>
                <h2>User information</h2>
                <p>${JSON.stringify(userData, null, 2)}</p>
                <p>
                    <a href='http://localhost:7080/api/v1/authenticate?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&response_type=code'>Login in again with Testausserveri ID</a>
                </p>
            `)
        } catch (e) {
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
    }

    if (!res.headersSent) {
        res.writeHead(404)
        res.write("Not found.")
    }

    res.end()
})

Server.listen(80, async () => {
    console.log("Example online!")
})
