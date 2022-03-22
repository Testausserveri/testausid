const scopeSeparator = {
    Discord: "%20",
    Twitter: "-",
    Github: ", "
}

const scopeConversion = {
    Discord: {
        id: "identify",
        account: "identify",
        contact: "email",
        security: null
    },
    Twitter: {},
    Github: {
        id: "read:user",
        account: "read:user",
        contact: "user:email",
        security: null
    }
}

/*
const removeLessValuable = {
    Discord: {},
    Twitter: {},
    Github: {}
}
*/

/**
 * Get OAuth 2.0 scopes based on session scopes
 * @param {string} platform
 * @param {import("../typings/schemas").sessionScope[]} sessionScopes
 * @returns {string}
 */
module.exports = (platform, sessionScopes) => {
    if (!scopeConversion[platform]) throw new Error("Unknown platform given")
    if (!scopeSeparator[platform]) throw new Error("No scope separator defined for the the given platform")
    return sessionScopes
        .map((scope) => scopeConversion[platform][scope])
        // .map((scope, _, scopes) => (Object.keys(removeLessValuable[platform]).includes(scope) && scopes.includes(removeLessValuable[platform][scope]) ? null : scope))
        .filter((val) => val !== null)
        .filter((val, index, ar) => ar.indexOf(val) === index) // No duplicates (quadratic time is a-ok)
        .join(scopeSeparator[platform])
}
