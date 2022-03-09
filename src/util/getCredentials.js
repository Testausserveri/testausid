const methods = require("../methods.json")
/**
 * Get OAuth 2.0 platform credentials
 * @param {string} platform
 * @param {string} name
 * @returns {string|object|array|null}
 */
module.exports = (platform, name) => {
    const obj = methods
        .filter((platformName) => platformName.name.toLowerCase() === platform.toLowerCase())[0]
    if (!obj) return null
    return process.env[obj.credentials[name]] ?? null
}
