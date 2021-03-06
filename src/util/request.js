/* eslint-disable guard-for-in */
/* eslint-disable global-require */
/* eslint-disable max-classes-per-file */

// Custom types
/**
 * @typedef {"GET"|"POST"|"PUT"|"DELETE"|"OPTIONS"} requestMethod
 */
/**
 * @typedef {object} requestOptions
 * @property {boolean} stringify Should the response body be converted into an utf-8 string (default: true)
 * @property {string} overrideContentLength Override the Content-Length header with this value
 */
/**
 * @typedef {object} requestResponse
 * @property {string} status HTTP response status code
 * @property {Object} headers HTTP response headers
 * @property {string|Buffer} data HTTP response body
 */

// Custom errors
class URLParsingError extends Error {
    constructor(m) {
        super(m)
        Object.setPrototypeOf(this, Error.prototype)
        this.name = "URLParsingError"
    }
}
class RequestError extends Error {
    constructor(m) {
        super(m)
        Object.setPrototypeOf(this, Error.prototype)
        this.name = "RequestError"
    }
}

// Protocol libraries
const protocols = {
    http: require("http"),
    https: require("https")
}

/**
 * Perform a simple HTTP request
 * @param {requestMethod} method
 * @param {string} url
 * @param {Object} headers
 * @param {string|Buffer|undefined} body
 * @param {requestOptions} options
 * @returns {Promise<requestResponse>}
 */
module.exports = (
    method, url, headers, body, options
) => new Promise((resolve, reject) => {
    // Parse the URL
    let urlInstance
    try {
        urlInstance = new URL(url)
    } catch (err) {
        reject(new URLParsingError(err))
        return
    }

    // Get the correct protocol library
    const library = protocols[urlInstance.protocol.toLowerCase().replace(":", "")]
    if (library === undefined) {
        reject(new RequestError(`Unknown protocol. Expected one of ${Object.keys(protocols).join(", ")}. Got "${urlInstance.protocol}"`))
        return
    }

    // Validate body format
    if (typeof body !== "string" && !(body instanceof Buffer) && body !== undefined) {
        reject(new RequestError("Body type is incorrect. Expected type of string or instance of Buffer"))
        return
    }

    // Validate header format
    if (typeof headers !== "object" && typeof headers !== "undefined") {
        reject(new RequestError("Headers must be type of object"))
        return
    }

    // Do the request
    const request = library.request(urlInstance, { method }, (res) => {
        const buffer = []
        res.on("data", (chunk) => buffer.push(chunk))
        res.once("end", () => resolve({
            status: res.statusCode,
            headers: res.headers,
            data: options?.stringify === false ? Buffer.concat(buffer) : Buffer.concat(buffer).toString()
        }))
    })

    // Send headers
    if (headers !== undefined && Object.keys(headers).length !== 0) for (const header of Object.keys(headers)) request.setHeader(header, headers[header])
    if (options?.overrideContentLength) request.setHeader("Content-Length", options.overrideContentLength)
    else if (body !== undefined && body.length > 0) {
        request.setHeader("Content-Length", Buffer.byteLength(body))
        request.write(body)
    }
    request.end()
})
