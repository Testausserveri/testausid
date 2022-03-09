/**
 * Server method example
 */
module.exports = {
    // eslint-disable-next-line no-useless-escape
    path: "", // RegEx or a normal string
    /**
     * Method handler function
     * @param {import("http").IncomingMessage} req
     * @param {import("http").ServerResponse} res
     * @param {function} next
     */
    handler: async (req, res, next) => {
        // Do stuff!
    }
}
