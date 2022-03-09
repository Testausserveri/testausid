/**
 * Find an object with a matching key and value from an array
 * @param {string} key
 * @param {*} value
 * @param {Array} array
 * @returns {Object|undefined}
 */
module.exports = (key, value, array) => {
    if (!(array instanceof Array)) throw new Error("Invalid array parameter")
    if (typeof key !== "string") throw new Error("Invalid key parameter")
    return array.filter((obj) => obj[key] === value)[0]
}
