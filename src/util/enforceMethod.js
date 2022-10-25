/**
 * Enforce methods
 * @param {String|String[]} method Enforce methods
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @returns {Boolean}
 */
module.exports = async function enforceMethod(method, req) {
    if (typeof req?.method !== "string") throw new Error(`Unexpected request method (${req?.method})`)
    if (typeof method !== "string") throw new Error("Given method must be type of string")
    if (Array.isArray(method)) return method.map((m) => m.toLowerCase()).includes(req.method.toLowerCase())
    return method.toLowerCase() === req.method.toLowerCase()
}
