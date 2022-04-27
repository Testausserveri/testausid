// Constants
const favoredBrandType = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
const selectedBrand = localStorage.getItem("brand") ?? ""
const errorText = document.getElementById("errorText")
const footer = document.getElementById("footer")
const originalHref = String(window.location.href)
const useCache = localStorage.getItem("useCache") !== null
console.log("UseCache?", useCache)
localStorage.removeItem("useCache")

// Variables
let applicationReady = false
let methodsReady = false
let redirecting = false
let contentDisplayed = false

// Elements
const container = document.getElementById("container")
const appContent = document.getElementById("appContent")
const methods = document.getElementById("methods")
const cancelButton = document.getElementById("cancel")
const scopesList = document.getElementById("scopes")
const brandsList = document.getElementById("brands")
const brandListButton = document.getElementById("brandsButton")
const returnButton = document.getElementById("return")
const blurCover = document.getElementById("blur")

// Scope definitions
const scopesTable = {
    token: "Access your account directly",
    id: "Access your unique account identifier",
    account: "Access to public account information",
    contact: "Access to possibly private contact information",
    security: "Access to your account security details"
}

// Get query params
function getQueryParam(param) {
    const url = new URL(window.location.href)
    return url.searchParams.get(param)
}

// Apply branding
function setBrand(brand) {
    const newBrand = window.branding.brands[brand]
    if (!newBrand) throw new Error("Unknown brand")

    // Apply colors
    const documentRoot = document.querySelector(":root")
    if (!documentRoot) throw new Error("Unable to access :root")
    for (const color in newBrand.colors) {
        if (Object.prototype.hasOwnProperty.call(newBrand.colors, color)) {
            documentRoot.style.setProperty(`--${color}`, newBrand.colors[color])
        } else console.warn("Skipped", color, "in colors")
    }
    // Content
    for (const name in newBrand.text) {
        if (Object.prototype.hasOwnProperty.call(newBrand.text, name)) {
            const elements = document.getElementsByName(name)
            for (const element of elements) element.innerText = newBrand.text[name]
        } else console.warn("Skipped", name, "in names")
    }

    // Selection
    for (const brandButton of brandsList.children) {
        if (brandButton.getAttribute("name") === `brand-${brand}`) brandButton.style.border = "1px var(--highlight)"
        else brandButton.style.border = ""
    }

    localStorage.setItem("brand", brand)
    window.activeBrand = brand
}

// Generate dummy image
function dummyImage() {
    const canvas = document.createElement("canvas")
    canvas.height = 80
    canvas.width = 80
    canvas.style.visibility = "hidden"
    document.body.append(canvas)
    const ctx = canvas.getContext("2d")
    ctx.font = "80px Poppins"
    ctx.fillStyle = window.branding.brands[window.activeBrand].colors.highlight
    ctx.textAlign = "center"
    ctx.fillText("?", 40, 70)
    return canvas.toDataURL()
}

// Redirect to login
function redirectTo(url) {
    if (redirecting) throw new Error("Already trying to redirect")
    redirecting = true
    container.style.opacity = 0
    container.style.display = "none"
    window.location.replace(url)
}

// Error
function toError(text) {
    errorText.innerText = text
    appContent.style.display = "none"
    errorText.style.display = "block"
    footer.style.display = "none"
}

// Cancel a redirect
cancelButton.onclick = () => {
    if (!redirecting) return
    localStorage.setItem("useCache", "true")
    window.location.replace(originalHref)
}

// Cancel the login
returnButton.onclick = () => {
    if (!window.application?.homepage) return
    window.location.href = window.application.homepage
}

// Display the app content
async function display() {
    if (!applicationReady || !methodsReady || !window.activeBrand || contentDisplayed) return
    contentDisplayed = true
    container.style.display = "flex"
    await new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)) })
    container.style.opacity = 1
    await new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)) })
    appContent.style.opacity = 1
    appContent.style.maxHeight = "10000px" // Has to just be a big number to trigger the animation
    methods.style.opacity = 1
    methods.style.maxHeight = "10000px" // Has to just be a big number to trigger the animation
}

// Fetch application information
appContent.style.opacity = 0
appContent.style.maxHeight = "0px"
function processApplication(data) {
    console.log("Application", data)
    if (Object.keys(data).length === 0) {
        toError("Invalid client_id")
        return
    }
    window.application = data
    localStorage.setItem("applicationCache", JSON.stringify(data))

    // Application names
    const targetFields = document.getElementsByName("target")
    for (const element of targetFields) element.innerText = data.name
    // Application icon
    const icon = document.getElementById("targetImage")
    icon.src = data.icon
    icon.onerror = () => { icon.src = dummyImage() }
    icon.setAttribute("alt", "Application icon")
    // Application homepage
    const homepage = document.getElementById("targetHomepage")
    homepage.href = data.homepage
    homepage.innerText = data.homepage
    // Scopes
    const scopes = getQueryParam("scopes")
    if (scopes === null) {
        toError("Invalid scopes")
        return
    }
    for (const scope of scopes.split(",")) {
        const scopeElement = document.createElement("li")
        scopeElement.innerText = scopesTable[scope]
        scopesList.appendChild(scopeElement)
    }

    applicationReady = true
    display()
}
function getApplication() {
    if (useCache) {
        processApplication(JSON.parse(localStorage.getItem("applicationCache")))
    } else {
        fetch(`/api/v1/application?client_id=${getQueryParam("client_id")}`)
            .then((response) => response.json())
            .then((data) => processApplication(data))
            .catch((e) => {
                console.error("Application", e)
            })
    }
}

// Fetch branding
container.style.opacity = 0
async function processBranding(data) {
    console.log("Branding", data)
    window.branding = data
    getApplication()
    localStorage.setItem("brandCache", JSON.stringify(data))

    // Populate list
    // eslint-disable-next-line guard-for-in
    for (const name in data.brands) {
        const brand = data.brands[name]
        const li = document.createElement("li")
        const text = document.createElement("p")
        text.innerText = name
        const icon = document.createElement("img")
        icon.setAttribute("alt", "Theme type")
        if (brand.type === "dark") icon.src = "/app/assets/DarkTheme.svg"
        else icon.src = "/app/assets/LightTheme.svg"
        li.onclick = () => setBrand(name)
        li.append(icon, text)
        brandsList.appendChild(li)
    }

    // Select the previously selected brand
    if (selectedBrand !== "") setBrand(selectedBrand)
    // Set to default brand if the type is favored
    else if (window.branding.brands[window.branding.defaultBrand].type === favoredBrandType) setBrand(window.branding.defaultBrand)
    // Try to set to favored brand type
    else {
        const favoredBrand = Object.keys(window.branding.brands)
            .filter((brandName) => window.branding.brands[brandName].type === favoredBrandType)[0]
        // If no brand with the favored type is available, set default
        if (!favoredBrandType) setBrand(window.branding.defaultBrand)
        // Set favored brand type
        else setBrand(favoredBrand)
    }

    display()
}
if (useCache) {
    processBranding(JSON.parse(localStorage.getItem("brandCache")))
} else {
    fetch("/app/branding.json")
        .then((response) => response.json())
        .then((data) => processBranding(data))
        .catch((e) => {
            console.error("Branding", e)
        })
}

// Fetch methods
methods.style.maxHeight = "0px"
methods.style.opacity = 0
function processMethods(data) {
    localStorage.setItem("methodsCache", JSON.stringify(data))
    for (const method of data) {
        const li = document.createElement("li")
        const img = document.createElement("img")
        const p = document.createElement("p")

        img.src = method.icon
        img.setAttribute("alt", method.name)
        img.onerror = () => { img.src = dummyImage() }
        p.innerText = method.name
        li.setAttribute("name", `brand-${method.name}`)
        li.onclick = () => redirectTo(`/api/v1/login?state=${getQueryParam("state")}&method=${method.id}`)

        li.append(img, p)
        methods.appendChild(li)
    }

    methodsReady = true
    display()
}
if (useCache) {
    processMethods(JSON.parse(localStorage.getItem("methodsCache")))
} else {
    fetch("/api/v1/methods")
        .then((response) => response.json())
        .then((data) => processMethods(data))
        .catch((e) => {
            console.error("Methods", e)
        })
}

// Brand selection
brandListButton.onclick = async () => {
    brandsList.style.display = "block"
    blurCover.style.display = "block"
    await new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)) })
    if (brandsList.style.opacity !== "1") {
        brandsList.style.opacity = "1"
        brandsList.style.maxHeight = `${brandsList.children.length * 52}px`
        blurCover.style.opacity = "0.8"
    } else {
        brandsList.style.opacity = "0"
        brandsList.style.maxHeight = "0px"
        blurCover.style.opacity = "0"
    }
    if (brandsList.style.opacity === "0") {
        setTimeout(() => {
            brandsList.style.display = "none"
            blurCover.style.display = "none"
        }, 400)
    }
}
brandsList.style.display = "none"
brandsList.style.maxHeight = "0px"
window.addEventListener("click", (event) => {
    if (brandsList.style.display !== "none" && event.target !== brandListButton && event.target !== brandListButton) brandListButton.click()
})
