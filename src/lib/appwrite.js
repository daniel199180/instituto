import { Client, Account, Databases } from "appwrite";

const client = new Client()
  .setEndpoint("https://agencia-appwrite.n2wanx.easypanel.host/v1")
  .setProject("6a490aa3003a6a052c4f");

const account = new Account(client);
const databases = new Databases(client);

export { client, account, databases };
