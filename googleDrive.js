const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 */
async function listFiles(authClient) {
  const drive = google.drive({version: 'v3', auth: authClient});
  const res = await drive.files.list({
    pageSize: 10,
    fields: 'nextPageToken, files(id, name)',
  });
  const files = res.data.files;
  if (files.length === 0) {
    console.log('No files found.');
    return;
  }

  return files;
}

async function listPictures(authClient) {
  const drive = google.drive({ version: 'v3', auth: authClient });

  // Find the ID of the "Pictures" folder
  const folderRes = await drive.files.list({
    q: "mimeType = 'application/vnd.google-apps.folder' and name = 'Pictures'",
    fields: 'files(id)',
  });
  const folder = folderRes.data.files.length > 0 ? folderRes.data.files[0] : null;
  if (!folder) return []; // Return empty if the folder is not found

  // List all files in the "Pictures" folder
  const filesRes = await drive.files.list({
    q: `'${folder.id}' in parents`,
    fields: 'files(id, name)',
  });

  const files = filesRes.data.files.map(file => {
    const link = `https://drive.google.com/uc?export=view&id=${file.id}`;
    return {...file, link };
  });

  return files;
}


async function listRecipes(authClient) {
  const drive = google.drive({ version: 'v3', auth: authClient });

  // Find the ID of the "Recipes" folder
  const folderRes = await drive.files.list({
    q: "mimeType = 'application/vnd.google-apps.folder' and name = 'Recipes'",
    fields: 'files(id)',
  });
  const folder = folderRes.data.files.length > 0 ? folderRes.data.files[0] : null;
  if (!folder) return []; // Return empty if the folder is not found

  // List all files in the "Recipes" folder
  const filesRes = await drive.files.list({
    q: `'${folder.id}' in parents`,
    fields: 'files(id, name)',
  });

  const files = filesRes.data.files.map(file => {
    const link = `https://drive.google.com/uc?export=view&id=${file.id}`;
    return {...file, link };
  });

  return files;
}


async function getFolderStructure(authClient) {
  const drive = google.drive({ version: 'v3', auth: authClient }); // Initialize Google Drive API client with given 'authClient'

  // Retrieve all folders
  const folderRes = await drive.files.list({
    q: "mimeType = 'application/vnd.google-apps.folder'",
    fields: 'files(id, name)',
  });
  let folders = folderRes.data.files;
  let folderStructure = {};

  // Initialize folders in the structure
  folders.forEach(folder => {
    folderStructure[folder.id] = { name: folder.name, files: [] };
  });

  // Retrieve all files
  const fileRes = await drive.files.list({
    q: "mimeType!='application/vnd.google-apps.folder'",
    fields: 'files(id, name, parents)',
  });
  let files = fileRes.data.files;

  // Map files to folders
  files.forEach(file => {
    if (file.parents && file.parents.length > 0) {
      const parentFolderId = file.parents[0];
      if (folderStructure[parentFolderId]) {
        folderStructure[parentFolderId].files.push({ id: file.id, name: file.name, link: `https://drive.google.com/uc?export=view&id=${file.id}` });
      }
    }
  });

  return folderStructure;
}

authorize().then(listFiles).catch(console.error);

module.exports = {
  listFiles: async function() {
    const authClient = await authorize();
    return listFiles(authClient);
  },
  getFolderStructure: async function() {
    const authClient = await authorize();
    return getFolderStructure(authClient);
  },
  listPictures: async function() {
    const authClient = await authorize();
    return listPictures(authClient);
  },
  listRecipes: async function() {
    const authClient = await authorize();
    return listRecipes(authClient);
  }
};