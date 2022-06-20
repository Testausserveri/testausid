const scopeSeparator = {
    Discord: "%20",
    Twitter: "-",
    Github: ", ",
    Google: " ",
    Members: " ",
    WilmaPlus: " "
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
    },
    Google: {
        id: "openid",
        account: "https://www.googleapis.com/auth/userinfo.profile",
        contact: "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/user.phonenumbers.read",
        security: "https://www.googleapis.com/auth/userinfo.profile"
    },
    Members: {
        id: "openid",
        account: "https://www.googleapis.com/auth/userinfo.profile",
        contact: "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/user.phonenumbers.read",
        security: "https://www.googleapis.com/auth/userinfo.profile"
    },
    WilmaPlus: {
        id: "openid",
        account: "profile",
        contact: "email",
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
    if (!scopeConversion[platform]) throw new Error(`Unknown platform given: "${platform}"`)
    if (!scopeSeparator[platform]) throw new Error(`No scope separator defined for the the given platform: "${platform}"`)
    return sessionScopes
        .map((scope) => scopeConversion[platform][scope])
        // .map((scope, _, scopes) => (Object.keys(removeLessValuable[platform]).includes(scope) && scopes.includes(removeLessValuable[platform][scope]) ? null : scope))
        .filter((val) => val !== null)
        .filter((val, index, ar) => ar.indexOf(val) === index) // No duplicates (quadratic time is a-ok)
        .join(scopeSeparator[platform])
}
