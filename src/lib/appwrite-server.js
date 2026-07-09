import "server-only";

import {
  Account,
  Client,
  Databases,
  Functions,
  ID,
  Query,
  Teams,
  Users,
} from "node-appwrite";

export const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "main";

function getAppwriteConnection() {
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID;

  if (!endpoint || !projectId) {
    throw new Error("Faltan variables server-side de Appwrite.");
  }

  return { endpoint, projectId };
}

function createAdminClient() {
  const { endpoint, projectId } = getAppwriteConnection();
  const apiKey = process.env.APPWRITE_API_KEY;

  if (!apiKey) {
    throw new Error("Faltan variables server-side de Appwrite.");
  }

  return new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);
}

export function createAdminDatabases() {
  return new Databases(createAdminClient());
}

export function createAdminFunctions() {
  return new Functions(createAdminClient());
}

export function createAdminTeams() {
  return new Teams(createAdminClient());
}

export function createAdminUsers() {
  return new Users(createAdminClient());
}

/**
 * Only used to create a session during login: the Account service returns
 * the session `secret` in the response solely when called with an API key,
 * which is what lets us store it server-side instead of relying on a
 * browser cookie against Appwrite's own domain.
 */
export function createAdminAccount() {
  return new Account(createAdminClient());
}

/**
 * Client scoped to a single user's own Appwrite session (no API key).
 * Used to verify who is actually calling a Server Action, since the
 * admin clients above have full privileges and must never be reached
 * without first confirming the caller's identity through this client.
 */
export function createSessionClient(sessionSecret) {
  const { endpoint, projectId } = getAppwriteConnection();
  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setSession(sessionSecret);

  return {
    account: new Account(client),
    teams: new Teams(client),
  };
}

export { ID, Query };
