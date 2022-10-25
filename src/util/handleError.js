/**
 * Handle server error
 * @param {Error} err
 * @param {import("http").ServerResponse} res
 * @param {Boolean} noCors Should we disable cors?
 */
module.exports = async function handleError(err, res, noCors) {
    if (err.toString().replace("Error: ", "").startsWith("safe: ")) {
        res.writeHead(400, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": noCors ? "*" : "testausserveri.fi"
        })
        res.end(JSON.stringify({
            error: err.toString().replace("safe: ", "")
        }))
    } else {
        res.writeHead(500, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": noCors ? "*" : "testausserveri.fi"
        })
        res.end(JSON.stringify({
            error: "Unexpected internal server error"
        }))
    }
}
