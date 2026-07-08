// src/modules/auth/application/dtos/refresh-token.dto.ts
//
// Flows 5 (refresh) and 6 (logout) read the refresh token from the `refresh_token`
// httpOnly cookie and the access token from the Authorization header — there is NO
// request body, so there is no class-validated DTO here. This file documents that on
// purpose; the controller (later) will pull the tokens from cookie/header.

export {};
