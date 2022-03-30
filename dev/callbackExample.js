const getCredentials = require("../../../util/getCredentials")

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
    redirectWithCode(session, res)
}
