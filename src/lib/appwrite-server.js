import "server-only";

import {
  Client,
  Databases,
  Functions,
  ID,
  Query,
  Teams,
  Users,
} from "node-appwrite";

export const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "main";

function createAdminClient() {
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;

  if (!endpoint || !projectId || !apiKey) {
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

export { ID, Query };
