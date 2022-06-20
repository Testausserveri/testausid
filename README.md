<div align="center">
    <img src="https://raw.githubusercontent.com/Testausserveri/testausserveri-id/main/logo.png" width="200px" height="200px">
    <h1>Testausserveri ID</h1>
</div>
<br>

*Use one OAuth2 service as a proxy for many more.*

That's the general idea. The implementation though, in the terms of security, is a little more complex.

For now, this project implements 2 methods of authentication, Discord and Twitter (more are being added).

Twitter represents the OAuth 1.0a authentication flow and Discord the OAuth 2.0 authentication flow.

**Due to the severe implications of a possible programming error or a vulnerability in a project like this, this project will remain as a demo until further notice. DO NOT USE IT IN ANY PRODUCTION ENVIRONMENT!**

You can test the application directly at `id.testausserveri.fi`
and the example client implementation at `idexample.testausserveri.fi`.

# TODO-list
You should read these before making an issue. These will be fixed/implemented asap.
- Distinguishable unique identifiers. Tokens, codes, secrets and ids should look different. For example, the ID could only be numbers.
- Port over the other 8 login methods from the prototype
- General codebase cleanup and code audit
- Cybersecurity assessment
- Bug bounty?
- Docker setup
- Token revocation after authentication

# Documentation
This is the draft documentation for this project.

## General
This project's backend is developed with `Node.Js v16.13.2` and uses `Docker` and `Docker-compose` for development and deployment. `MongoDB` functions as the backend database. Major dependencies are the `mongoose` and `dotenv` packages from the `NPM-registry`, otherwise this project only uses native Node.Js libraries.

The front-end is rather bare-bones and is developed with pure `HTML5`, `CSS` and `JavaScript`.

### Configuration
Relevant configuration for the front-end exists in `/src/app/branding.json`. This is the configuration for the front-end application's themes. All colors and relevant text is configurable.

Login methods are configured with `/src/methods.json`. The only notable thing about the structure is that the credentials object's key's values are environment variable names.

Environment variables are configured with the `.env` file. See `.env.example` for more details on what variables are required.

### CLI
This project implements a rather simple CLI to create, update and remove application registrations, though these details can be updated directly to the database by some other program as long as they follow the specified database schemas.

Command usage and definitions can be viewed with the `help` command.

**Example output**
```
Commands:
- "exit", closes the program.
- "help", displays this message.
- "createApplication <MongoDB JSON query>", create an application.
    - name: string
    - homepage: string
    - icon: base64 image string
    - redirectURLS: string[]
- "updateApplication <MongoDB JSON query>", update an application.
    - identical with createApplication
- "getApplications", get all applications.
- "removeApplication <MongoDB JSON query>", remove an application.
    - id: string
```

### Project structure
```tree
src
├───app
├───database
├───methods
│   └───api
│       ├───_callbacks
│       └───_preflights
├───typings
└───util
```
- The `app` directory contains the front-end application for method selection during login.
- The `database` directory contains all database-related scripting and schemas.
- The `methods` directory is a collection of dynamically loaded webserver methods. A template for these methods is available in `/dev`. The directory structure of the `methods` directory does not in any way reflect how the methods are loaded. It exists only for the sake of organization of files.
- The `typings` folder includes all the `*.ts` typings for IntelliSense (etc.)
- The `util` directory includes various smaller scripts and libraries used across this project's source code.

### Running this project
This project uses `docker-compose` for deployment and testing.
You can run the project with `docker-compose up`.

To run the project without `docker-compose`, you need to have `Node v16.13.2` and `NPM v8.1.2` or later installed (older version may work) and follow these steps:
- Install all dependencies with `npm install`
- Define `DATABASE_URL` in the `.env` as the URL of the `MongoDB` database.
- Run the project with `npm start`

## API v1 Documentation
The API root is: `/api/v1/`

Methods marked with `(private)` are only used internally.

API v1 implements a standard `OAuth 2.0` authentication service, with the following configuration:
- `GET /api/v1/authenticate` as the authorization endpoint.
- `POST /api/v1/token` as the token retrieval endpoint.

**Error format**
```json
{ "error": "<error description>" }
```

*The "error" value will never be included in the response if it was successful.*
<br>

**Available scopes**
```
- "token", pass through the account accessToken from the authentication flow (high risk)
- "id", include the user-id in the /api/v1/me response
- "account", include general account details, like the account name and icon in the /api/v1/me response
- "contact", include account email and/or phone number in the /api/v1/me response
- "security", include relevant information about the account security configuration in the /api/v1/me response
```

*At least one scope must always be included*

**Example flow of authentication with v1**
1. `[CLIENT]` The user is redirected to `/api/v1/authenticate?...` from the client application.
    - A new authentication session is created in the backend (stage: `created`)*
2. The user is automatically redirected to `/app?state=...`
3. The user selects the platform to authenticate with.
4. The user is redirected to `/api/v1/login?platform=...&state=...`
    - Authentication stage changes in the backend (state: `pending`)*
5. The user is automatically redirected to platform's login service.
6. The user is redirected from the platform login to `/api/v1/callback` after authenticating.
    - Authentication stage changes (stage: `completed`)*
7. `[CLIENT]` The user is redirected back to client application's callback URL with `code=...` in the request query.
8. `[CLIENT]` The client application makes a request to `/api/v1/token?code=...` and gets token
    - Authentication stage changes in the backend (stage: `stored`)*
9. `[CLIENT]` The client application makes a request to `/api/v1/me` with token in the header: `Authentication: Bearer <token>`
    - Authentication session is deleted
<br>

--> User has now been authenticated

**An authentication stage change defines a point of no return for the authentication flow*
*Steps prefixed with `[CLIENT]` are the clients responsibility*

### **Methods**

### `POST /api/v1/token`
Exchange the "code" for an access token to access the authenticated user's information.

**Request requirements**
- Header "Content-Type" must be "application/x-www-form-urlencoded"
- Body must include parameters "code", "grant_type", "redirect_uri", "client_id" and "client_secret".
    - "grant_type" must be "authorization_code"
    - "redirect_uri" must match with the uri used before with /authenticate

**Example response**
```http
HTTP/1.1 200 OK
Content-Type: application/json
Date: Mon, 07 Mar 2022 09:46:17 GMT
Connection: close
Content-Length: ...
```

```json
{ "token": "...", "expiry": "<ms>" }
```

### `GET /api/v1/application`
Retrieve information about a registered application. Displayed during the login process.

**Example response**
```http
HTTP/1.1 200 OK
Content-Type: application/json
Date: Mon, 07 Mar 2022 09:46:17 GMT
Connection: close
Content-Length: 107
```

```json
{ "id": "d3c89442d3574aa5bbaea011f2d43e14", "name": "Test application", "icon": "","homepage": "http://localhost" }
```

### `GET /api/v1/methods`
Retrieve a list of available authentication methods.

**Example response**
```http
HTTP/1.1 200 OK
Content-Type: application/json
Date: Mon, 07 Mar 2022 09:46:16 GMT
Connection: close
Content-Length: 193
```

```json
[
    {
        "name": "Discord",
        "id": "2db260c7-8ca9-42a3-8de8-a6a3c37be89e",
        "icon": "/app/assets/Discord.svg"
    },
    {
        "name": "Twitter",
        "id": "ba8aad4d-9014-4ecc-9df3-e2d520b4c23e",
        "icon": "/app/assets/Twitter.svg"
    }
]
```

### `GET /api/v1/authenticate`
Begin the authentication flow by creating a new authentication session.

**Request requirements**
- Request query must include `response_type=code`.
- Request query must contain valid `client_id`, `redirect_uri` and `scope` parameters (more about scopes above).

**Optional**
- The request query may include the `state` query parameter to identify the session callback later on in the authentication flow.

**Example response**
```http
HTTP/1.1 307 Temporary Redirect
Location: /app?scopes=token,id,account,contact,security&client_id=d3c89442d3574aa5bbaea011f2d43e14&state=572dd500b8c73b26b00a45693336058c&redirect_uri=http://localhost/callback
Content-Type: text/html
Date: Mon, 07 Mar 2022 09:46:15 GMT
Connection: close
Content-Length: 218
```

```html
If you are not redirected click <a href="/app?scopes=token,id,account,contact,security&client_id=d3c89442d3574aa5bbaea011f2d43e14&state=572dd500b8c73b26b00a45693336058c&redirect_uri=http://localhost/callback">this</a>.
```

### `GET /api/v1/login` (private)
Redirect the user to the method login.

**Request requirements**
- The request query must include valid `state` (redirectId) and `method` (id) parameters.

**Example response**
```http
HTTP/1.1 307 Temporary Redirect
Location: https://discord.com/api/oauth2/authorize?...
Content-Type: text/html
Date: Mon, 07 Mar 2022 09:46:18 GMT
Connection: close
Content-Length: ...
```

```html
If you are not redirected, click <a href="https://discord.com/api/oauth2/authorize?...">here</a>.
<br>
<i>(https://discord.com/api/oauth2/authorize?...)</i>
```

### `GET /api/v1/callback` (private)
The callback url from the selected authentication method. Request requirements are method specific. Responses are method specific. See `/src/methods/api/_callbacks/`.

### `GET /api/v1/me`
Get information about the logged-in user.

**Request requirements**
- The request headers must include the account access token as "Bearer" (`Bearer <token>`).

**Example response**
```http
HTTP/1.1 200 OK
Content-Type: text/html
Date: Mon, 07 Mar 2022 09:46:18 GMT
Connection: close
Content-Length: ...
```

```json
{
    "?token": "<Account access token>",
    "?id": "<Account ID>",
    "?name": "<Account name>",
    "?account": "<General account information, platform specific>",
    "?security": "<Account security information, platform specific>",
    "?contact": "<Account contact details, platform specific>",
    "scopes": "String[]",
    "applicationId": "<Application ID>",
    "platform": {
        "id": "<Platform ID>",
        "name": "<Platform name>"
    }
}
```

*The fields prefixed with ? are present/missing depending on what scopes were used. See available scopes above.*


# Development resources and notes
About OAuth: https://aaronparecki.com/oauth-2-simplified/

## Authentication statuses
- created (after /authenticate call)
- pending (after platform has called back, user redirected)
- completed (after callback)
- stored (token given, pending for deletion)

## Logging errors in V1 API
Errors thrown by methods, which begin with `safe: `, will have their message as a string in the response.

## Implementation best practices - ideas
Verifying the user used the same platform as before to authenticate is essential. Could we somehow force this check to take place? Like including the platform id within the user id? Or the platform name?

## Implementing a new method
Implementing a new authentication method *should* be a trivial task.
Here's a step-by-step guide on how to do that.
1. First, create the callback in `src/methods/api/_callbacks/`. The name of the file has to be the method `<name>.js?`.
    - A template for callbacks can be found in `dev/methodExample.js`
2. Write the method configuration to `src/methods.json`
    
    *Example*
    ```json
        {
            "name": "Example",
            "prettyName": "Optional pretty name with spaces and stuff",
            "id": "<Random uuidV4>",
            "icon": "/app/assets/<name>.svg",
            "url": "https://example.com/login/oauth/authorize?scope=${scopes}&client_id=${process.env.EXAMPLE_CLIENT_ID}&redirect_uri=${redirectURI}%3Fstate=${state}",
            "credentials": {
                "clientId": "EXAMPLE_CLIENT_ID",
                "secret": "EXAMPLE_CLIENT_SECRET"
            }
        }
    ```

    *The credential's fields values are the names of the environment variables used to store the credentials in `.env`. The keys of these fields define what name you will use with the `getCredentials` utility. In this case you can read the clientId at runtime with `getCredentials("Example", "clientId")`.*

    *The url is the OAuth server URL for the method to be added. For all the variables, look at the list further below.*

    *The icon field's value is the location of the method icon accessible in the `src/app` directory. The icon is directly used in the img element's source, so no special format restrictions apply.*
3. Implement scope conversions in `src/util/getScopes`. Configuration is at the top of the file (this may change soon).
    - Include the character(s) that separates scopes in the `scopeSeparator` object, when multiple scopes are used.
    - Include direct scope conversions in the `scopeConversion` object. These are direct key->value conversions to convert Testausserveri ID scopes to the ones the specific method wants to access the appropriate data. Using the least permissive scopes during conversion is recommended.
4. Include the credentials in the `.env` files with the names you specified before in `src/methods.json`

...and that's it!

## `src/methods.json` supported variables
- `${scopes}`, authentication scopes generated by scope conversions
- `${process.env.<name>}`, a dynamic way to input any environment variable to the url. Especially useful for avoiding static client ids in the url.
- `${redirectURI}`, the Testausserveri ID redirect uri.
- `${state}`, the required authentication state code defined by Testausserveri ID.

# Contributing
Contributions are welcome. A few requirements:
- Read through this document
- Use conventional commits
- Use ESLint to enforce code-style and best practices

# LICENSE
```
   Copyright 2022 Testausserveri ry

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```
