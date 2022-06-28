const getCredentials = require("../../../util/getCredentials")
const callbackRedirect = require("../../../util/callbackRedirect")
const request = require("../../../util/request")
const { updateAuthenticationSession } = require("../../../database/client")

/**
 * Platform OAuth x.xx callback
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {import("../../../typings/schemas").authenticationSession} session
 * @param {string} redirectURL
 */
module.exports = async (
    req, res, session, redirectURL
) => {
    // Do stuff!

    // Redirect to application
    await callbackRedirect(session, res)
}
