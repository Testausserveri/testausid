const { createHmac, randomBytes } = require("crypto")

// Encoding utilities
function percentEncode(str) {
    return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)
}
function encodeParams(params) {
    let encodedParams = ""
    for (const param of params.keys()) {
        const data = params.get(param)
        if (encodedParams.length !== 0) encodedParams += "&"
        encodedParams += `${percentEncode(param)}=${percentEncode(data)}`
    }
    return encodedParams
}
function sortParams(params) {
    const sortedParams = new URLSearchParams()
    const keys = []
    for (const key of params.keys()) keys.push(key)
    keys.sort((a, b) => {
        if (a < b) return -1
        if (a > b) return 1
        return 0
    })
    for (const key of keys) {
        sortedParams.append(key, params.get(key))
    }
    return sortedParams
}

/**
 * Generate OAuth 1.0 request parameter signature
 * @param {string} method
 * @param {string} url
 * @param {URLSearchParams} params
 * @param {string} consumerSecret
 * @param {string} token
 * @returns {{ signature: string, params: URLSearchParams }}
 */
module.exports = (
    method, url, params, consumerSecret, token
) => {
    if (!(params instanceof URLSearchParams)) throw new Error("Params must to be an instance of URLSearchParams!") // For ease of development

    // Append standard params
    params.append("oauth_nonce", randomBytes(16).toString("hex")) // A random string used once
    params.append("oauth_signature_method", "HMAC-SHA1")
    params.append("oauth_timestamp", (new Date().getTime() / 1000).toFixed(0)) // Seconds (epoch)
    params.append("oauth_version", "1.0")

    // Sort params alphabetically (unsure if this is required...)
    const sortedParams = sortParams(params)

    // Encode params
    const encodedParams = encodeParams(sortedParams)

    // Create the base string
    const baseString = `${method.toUpperCase()}&${percentEncode(url).replace(/%3F/, "&")}&${percentEncode(encodedParams)}`

    // Create the signature key
    const signatureKey = `${percentEncode(consumerSecret)}&${token}` // No token if it's empty

    // Generate the signature
    const signature = createHmac("sha1", signatureKey).update(baseString).digest("base64")
    sortedParams.append("oauth_signature", signature)

    return {
        signature,
        params: sortParams(sortedParams)
    }
}
