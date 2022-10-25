/**
 * Parse content type of www-form-urlencoded
 * @param {string} string
 * @returns {URLSearchParams}
 */
module.exports = function parseFormUrlEncoded(string) {
    try {
        return new URLSearchParams(string)
    } catch (e) {
        return false
    }
}
