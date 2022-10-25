/**
 * Get request body
 * @param {import("http").IncomingMessage} req
 * @returns {Promise<string>}
 */
module.exports = async function getBody(req) {
    const bodyBuffer = []
    req.on("data", (chunk) => bodyBuffer.push(chunk))
    await new Promise((resolve) => { req.on("end", resolve) })
    return Buffer.concat(bodyBuffer).toString()
}
