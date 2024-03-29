const {
    readFileSync, statSync, existsSync
} = require("fs")
// eslint-disable-next-line import/no-unresolved
const { normalize, join } = require("path/posix")
const enforceMethod = require("../util/enforceMethod")

const contentTypeTable = {
    css: "text/css",
    html: "text/html",
    js: "text/javascript",
    json: "application/json",
    png: "image/png",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    ico: "image/x-icon", // TODO: Correct?
    svg: "image/svg+xml"
}
const fileTypeRegex = new RegExp(`/${Object.keys(contentTypeTable).join("|")}/`)

/**
 * App static method
 */
module.exports = {
    // eslint-disable-next-line no-useless-escape
    path: "\/app.{0,256}|\/app\/", // RegEx or a normal string
    /**
     * Method handler function
     * @param {import("http").IncomingMessage} req
     * @param {import("http").ServerResponse} res
     * @param {function} next
     */
    handler: async (req, res, next) => {
        if (!enforceMethod("GET", req)) {
            res.writeHead(405)
            return res.end("Method not allowed")
        }
        try {
            // Construct and make sure the given path is safe to load files from
            let initialPath = normalize(new URL(req.url, `http://${req.headers.host}`).pathname.replace("/", "").replace(/(\.\.(\/|\\|))+/gm, ""))

            // If we request the directory root, respond with index.html
            if (initialPath === "app" || initialPath === "app/") initialPath = "app/index.html"
            let path = join(join(process.cwd(), "./src/"), initialPath)
            let fileType = path.split(".").reverse()[0].toLowerCase()

            // If path does not include a filetype, expect it to be .html.
            // If a .html file with the same name exists.
            if (!fileTypeRegex.test(fileType) && existsSync(`${path}.html`) && statSync(`${path}.html`).isFile()) {
                fileType = "html"
                path += ".html"
            } else if (!existsSync(path) || !statSync(path).isFile()) { // Make sure the file exists
                res.writeHead(404, {
                    "Content-Type": "text/plain"
                })
                return res.end("No such file")
            }

            // As a sanity check, the filepath should start with cwd+/src/app/
            // This should never be true and the regex above should be enough
            // to avoid filesystem traversal
            if (!path.startsWith(join(process.cwd(), "./src/app/"))) {
                res.writeHead(400, {
                    "Content-Type": "text/plain"
                })
                return res.end("Unexpected given filepath.")
            }

            // Send the data
            res.writeHead(200, {
                "Content-Type": contentTypeTable[fileType] ?? "text/plain",
                "Cache-Control": "max-age=31536000"
            })
            return res.end(readFileSync(path))
        } catch (err) {
            console.error("Filesystem error:", err)
            if (!res.headersSent && res.writable) {
                res.writeHead(500)
                return res.end("Filesystem error.")
            }
        }

        // Fallback
        return next()
    }
}
